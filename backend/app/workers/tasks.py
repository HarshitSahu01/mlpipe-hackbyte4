# backend/app/workers/tasks.py
"""
Core Celery task: run_inference_pipeline

For each node in the pipeline (sorted by order):
1. Pull the Docker image
2. Run the container, mounting shared_storage as a volume
3. Pass INPUT_PATH / OUTPUT_PATH as environment variables
4. Stream + capture logs
5. Check exit code
On completion: POST callback to Next.js webhook with status, paths, logs.
"""
from __future__ import annotations

import json
import os
import pathlib
import traceback
from typing import Any, Dict, List

import docker
import httpx
from celery import Task
from dotenv import load_dotenv

from app.core.celery_app import celery_app
from app.schemas.task import TriggerPayload, NodeSpec, WebhookPayload

load_dotenv()

# Resolve relative to the repo root (two levels up from this file: workers/ → app/ → backend/)
_DEFAULT_SHARED = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "shared_storage"
SHARED_STORAGE_PATH = pathlib.Path(os.getenv("SHARED_STORAGE_PATH", str(_DEFAULT_SHARED))).resolve()
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_WEBHOOK_URL", "http://localhost:3000/api/webhooks/fastapi")


def _send_webhook(task_id: str, status: str, results_path: str = "", logs_path: str = "", error: str = "", webhook_url: str = NEXTJS_WEBHOOK_URL) -> None:
    """Fire-and-forget POST to the Next.js webhook endpoint."""
    payload = {
        "task_id": task_id,
        "status": status,
        "results_path": results_path,
        "logs_path": logs_path,
        "error": error,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(webhook_url, json=payload)
    except Exception as exc:
        print(f"[webhook] Failed to notify Next.js: {exc}")


def _pull_image(client: docker.DockerClient, image: str) -> None:
    """Pull Docker image if not already cached locally."""
    try:
        client.images.get(image)
        print(f"[docker] Image already present: {image}")
    except docker.errors.ImageNotFound:
        print(f"[docker] Pulling {image} ...")
        client.images.pull(image)
        print(f"[docker] Pull complete: {image}")


def _run_node(
    client: docker.DockerClient,
    node: NodeSpec,
    task_id: str,
    log_lines: List[str],
) -> bool:
    """
    Run a single pipeline node container.
    Returns True on success, False on failure.
    """
    # Ensure output directory exists
    output_dir = pathlib.Path(node.output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # Ensure input directory exists (create empty input file if missing)
    input_dir = pathlib.Path(node.input_path).parent
    input_dir.mkdir(parents=True, exist_ok=True)
    if not pathlib.Path(node.input_path).exists():
        pathlib.Path(node.input_path).write_text(json.dumps({}))

    volumes = {
        str(SHARED_STORAGE_PATH): {
            "bind": "/shared_storage",
            "mode": "rw",
        }
    }

    # Remap absolute host paths → container paths
    def host_to_container(p: str) -> str:
        try:
            rel = pathlib.Path(p).resolve().relative_to(SHARED_STORAGE_PATH)
            return f"/shared_storage/{rel.as_posix()}"
        except ValueError:
            return p  # already a container path

    environment = {
        "INPUT_PATH": host_to_container(node.input_path),
        "OUTPUT_PATH": host_to_container(node.output_path),
        "MODEL_PATH": host_to_container(node.model_path) if node.model_path else "",
        "TASK_ID": task_id,
        "MODEL_ID": node.model_id,
    }

    log_lines.append(f"[DEBUG] INPUT_PATH going into container: {environment['INPUT_PATH']}")
    log_lines.append(f"[DEBUG] OUTPUT_PATH going into container: {environment['OUTPUT_PATH']}")

    _pull_image(client, node.docker_image)

    log_lines.append(f"\n--- Node {node.model_id} | image: {node.docker_image} ---")

    container = client.containers.run(
        image=node.docker_image,
        environment=environment,
        volumes=volumes,
        detach=True,
        remove=False,
    )

    exit_code = -1
    try:
        # Stream logs — guarantee cleanup even if streaming raises
        for line in container.logs(stream=True, follow=True):
            decoded = line.decode("utf-8", errors="replace").rstrip()
            log_lines.append(decoded)
            print(f"[container:{container.short_id}] {decoded}")

        result = container.wait()
        exit_code = result.get("StatusCode", -1)
    finally:
        container.remove(force=True)

    log_lines.append(f"--- Exit code: {exit_code} ---\n")
    return exit_code == 0


@celery_app.task(bind=True, name="run_inference_pipeline", max_retries=0)
def run_inference_pipeline(self: Task, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main Celery task.
    Accepts the TriggerPayload serialized as a dict.
    """
    payload = TriggerPayload(**payload_dict)
    task_id = payload.task_id
    webhook_url = payload.webhook_url or NEXTJS_WEBHOOK_URL

    log_lines: List[str] = [f"Predict-Xplore | Task: {task_id}"]

    # Task output directory on host
    task_output_dir = SHARED_STORAGE_PATH / "outputs" / task_id
    task_output_dir.mkdir(parents=True, exist_ok=True)
    logs_path = str(task_output_dir / "logs.txt")

    def flush_logs():
        pathlib.Path(logs_path).write_text("\n".join(log_lines), encoding="utf-8")

    # Notify Next.js: running
    _send_webhook(task_id, "running", logs_path=logs_path, webhook_url=webhook_url)

    docker_client = docker.from_env()

    try:
        import zipfile
        import shutil
        import concurrent.futures
        import threading

        # Ensure base directories exist on host
        run_input_base = SHARED_STORAGE_PATH / "runs" / task_id
        run_input_base.mkdir(parents=True, exist_ok=True)

        nodes_map = {node.id: node for node in payload.nodes}
        
        # 1. Build dependency graph
        in_degree = {nid: 0 for nid in nodes_map}
        for node in payload.nodes:
            for nxt in node.next_nodes:
                if nxt in in_degree:
                    in_degree[nxt] += 1

        ready_queue = [nid for nid, deg in in_degree.items() if deg == 0]
        completed_nodes = set()
        failed_nodes = set()
        
        log_lock = threading.Lock()
        
        def safe_log(msg: str):
            with log_lock:
                log_lines.append(msg)
                flush_logs()

        def execute_node(node: NodeSpec) -> bool:
            safe_log(f"\n[worker] Starting node: {node.id} (Model: {node.model_id})")
            local_logs = []
            
            try:
                input_p = pathlib.Path(node.input_path).resolve()

                # If it's a dependent node, we must gather outputs from its dependencies
                if node.depends_on:
                    input_p.mkdir(parents=True, exist_ok=True)
                    for dep_id in node.depends_on:
                        if dep_id in nodes_map:
                            dep_out = pathlib.Path(nodes_map[dep_id].output_path).resolve()
                            if dep_out.exists() and dep_out.is_dir():
                                # Copy everything from dep_out into this node's input dir
                                for child in dep_out.iterdir():
                                    if child.is_file():
                                        shutil.copy2(str(child), str(input_p / child.name))
                                    elif child.is_dir():
                                        shutil.copytree(str(child), str(input_p / child.name), dirs_exist_ok=True)
                
                # If root node, check inputs and handle zip extracts
                else:
                    if input_p.is_dir():
                        local_logs.append(f"[worker] Using upload directory as input: {node.input_path}")
                    elif input_p.is_file():
                        if input_p.suffix.lower() == ".zip":
                            extract_dir = run_input_base / f"{node.id}_extracted"
                            extract_dir.mkdir(parents=True, exist_ok=True)
                            with zipfile.ZipFile(str(input_p), 'r') as zip_ref:
                                zip_ref.extractall(extract_dir)
                            node.input_path = str(extract_dir)
                        else:
                            wrapper_dir = run_input_base / f"{node.id}_initial_input"
                            wrapper_dir.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(str(input_p), str(wrapper_dir / input_p.name))
                            node.input_path = str(wrapper_dir)
                    else:
                        local_logs.append(f"[ERROR] Input path does not exist: {node.input_path}")
                        raise FileNotFoundError(f"Input not found: {node.input_path}")

                success = _run_node(docker_client, node, task_id, local_logs)
            except Exception as e:
                local_logs.append(f"[EXCEPTION executing {node.id}]: {str(e)}")
                local_logs.append(traceback.format_exc())
                success = False

            # Commit logs safely
            with log_lock:
                log_lines.extend(local_logs)
                if not success:
                    log_lines.append(f"[ERROR] Node {node.id} failed.")
                flush_logs()
                
            return success

        # 2. DAG Execution Loop
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = {} # Future -> node_id
            
            for nid in ready_queue:
                futures[executor.submit(execute_node, nodes_map[nid])] = nid
                
            while futures:
                done, not_done = concurrent.futures.wait(
                    futures.keys(), return_when=concurrent.futures.FIRST_COMPLETED
                )
                
                for fut in done:
                    nid = futures.pop(fut)
                    try:
                        success = fut.result()
                        if success:
                            completed_nodes.add(nid)
                            for nxt in nodes_map[nid].next_nodes:
                                if nxt in in_degree:
                                    in_degree[nxt] -= 1
                                    if in_degree[nxt] == 0:
                                        futures[executor.submit(execute_node, nodes_map[nxt])] = nxt
                        else:
                            failed_nodes.add(nid)
                    except Exception as e:
                        safe_log(f"[EXCEPTION in DAG execution {nid}] {traceback.format_exc()}")
                        failed_nodes.add(nid)
                        
                if failed_nodes:
                    break # Abort pipeline if any node fails

        if failed_nodes:
            error_msg = f"Pipeline failed at nodes: {', '.join(failed_nodes)}"
            _send_webhook(task_id, "failed", logs_path=logs_path, error=error_msg, webhook_url=webhook_url)
            return {"status": "failed", "error": error_msg}

        # 3. Completion logic
        terminal_nodes = [n.id for n in payload.nodes if not n.next_nodes]
        final_output_path = nodes_map[terminal_nodes[0]].output_path if terminal_nodes else ""

        safe_log("\n✓ All nodes completed successfully.")

        _send_webhook(
            task_id,
            "completed",
            results_path=final_output_path,
            logs_path=logs_path,
            webhook_url=webhook_url,
        )
        return {"status": "completed", "results_path": final_output_path}

    except Exception as exc:
        error_msg = traceback.format_exc()
        log_lines.append(f"\n[EXCEPTION]\n{error_msg}")
        flush_logs()
        _send_webhook(task_id, "failed", logs_path=logs_path, error=str(exc), webhook_url=webhook_url)
        raise

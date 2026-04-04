import json
import os
import pathlib
import zipfile
import traceback
from typing import Any, Dict, Optional

from openai import OpenAI

try:
    from armoriq_sdk import ArmorIQClient
    _ARMORIQ_AVAILABLE = True
except ImportError:
    _ARMORIQ_AVAILABLE = False
    ArmorIQClient = None

def init_armoriq() -> Optional[Any]:
    aiq_key = os.getenv("ARMORIQ_API_KEY")
    if not aiq_key:
        print("[Packager] Warning: ARMORIQ_API_KEY not found. Agent will run without ArmorIQ.")
        return None
    try:
        return ArmorIQClient(api_key=aiq_key, user_id="system", agent_id="px-packager")
    except Exception as exc:
        print(f"[Packager] ArmorIQ init failed: {exc}")
        return None

def get_openai_client():
    # Uses OPENAI_API_KEY and OPENAI_BASE_URL by default from environment
    return OpenAI()

def extract_primary_script(input_path: str) -> str:
    """Read standard .py file or extract the most prominent .py file from a zip."""
    p = pathlib.Path(input_path)
    if not p.exists():
        raise FileNotFoundError(f"{input_path} not found")
        
    if p.is_file():
        if p.suffix == '.zip':
            # rudimentary unzip-and-find
            import tempfile
            with tempfile.TemporaryDirectory() as d:
                with zipfile.ZipFile(p, 'r') as zf:
                    zf.extractall(d)
                
                # find first python file
                py_files = list(pathlib.Path(d).rglob("*.py"))
                if not py_files:
                    raise ValueError("No .py files found in the uploaded zip.")
                return py_files[0].read_text(encoding="utf-8")
        else:
            return p.read_text(encoding="utf-8")
    else:
        py_files = list(p.rglob("*.py"))
        if not py_files:
            raise ValueError("No .py files found in the directory.")
        return py_files[0].read_text(encoding="utf-8")

def convert_to_predict_xplore(raw_code_string: str) -> dict:
    armoriq = init_armoriq()
    
    plan = {
        "goal": "Convert raw inference code to Predict-Xplore container format",
        "steps": [
            {
                "action": "refactor_code_and_generate_artifacts",
                "tool": "llm_code_modifier",
                "inputs": {"code_length": len(raw_code_string)}
            }
        ]
    }

    system_prompt = """
You are an expert MLOps agent. Refactor the provided user code to meet the Predict-Xplore standard.

STRICT RULES:
1. Refactor all data ingestion (e.g., pandas read_csv, sys.stdin, argparse) to read from a JSON file located at os.environ.get("INPUT_PATH").
2. Refactor all data output (e.g., print, to_csv) to write a JSON file to os.environ.get("OUTPUT_PATH").
3. Generate a complete requirements.txt by analyzing the imports in the user's code.
4. Generate a DOCKERFILE using `python:3.10-slim` that copies files, installs dependencies, and sets CMD ["python", "run.py"].
5. Do not include markdown formatting blocks in the json values.

Output your response STRICTLY as a JSON object with exactly three keys: "run_py", "requirements_txt", "dockerfile". 
"""

    if armoriq:
        try:
            # Capture plan
            plan_capture = armoriq.capture_plan(
                llm="gpt-5.4-mini",
                prompt="Refactoring user code for Predict-Xplore",
                plan=plan
            )
            # You could check an intent_token here if strict
            intent_token = armoriq.get_intent_token(plan_capture)
            
            # Policy Evaluate check (malicious check plugin)
            pe_result = armoriq.evaluate_content({
                "prompt": system_prompt,
                "input": raw_code_string
            })
            if pe_result and not pe_result.get("safe", True):
                raise ValueError("ArmorIQ flagged the input code as harmful or malicious.")
                
        except Exception as e:
            if "malicious" in str(e).lower():
                raise
            print(f"[Packager] ArmorIQ plan capture error: {e}")

    client = get_openai_client()
    try:
        response = client.chat.completions.create(
            model="gpt-5.4-mini",
            response_format={ "type": "json_object" },
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"USER CODE:\n{raw_code_string}"}
            ]
        )
        
        content = response.choices[0].message.content
        artifacts = json.loads(content)
        return artifacts
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to decode LLM response as JSON: {e}")
    except Exception as e:
        raise RuntimeError(f"LLM Call failed: {e}")

def package_artifacts(artifacts: dict, output_dir: str):
    """Writes the JSON dictionary outputs to physical files in the given directory."""
    out_path = pathlib.Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    
    run_py = artifacts.get('run_py', '')
    reqs = artifacts.get('requirements_txt', '')
    dockerfile = artifacts.get('dockerfile', '')
    
    (out_path / 'run.py').write_text(run_py, encoding='utf-8')
    (out_path / 'requirements.txt').write_text(reqs, encoding='utf-8')
    (out_path / 'DOCKERFILE').write_text(dockerfile, encoding='utf-8')
    
    print(f"[Packager] Wrote standard artifacts to {out_path}")

def process_upload(input_path: str, output_dir: str):
    print(f"[Packager] Extracting raw code from {input_path} ...")
    raw_code = extract_primary_script(input_path)
    
    print(f"[Packager] Refactoring code {len(raw_code)} bytes via AI ...")
    artifacts = convert_to_predict_xplore(raw_code)
    
    print(f"[Packager] Packaging to {output_dir} ...")
    package_artifacts(artifacts, output_dir)
    return True

"use client"; 

import React, { useState, useCallback, useRef, useEffect } from 'react';

const Icons = {
  Search: () => (
    <svg size="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  ),
  Plus: () => (
    <svg size="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M5 12h14m-7-7v14"/></svg>
  ),
  Play: ({ fill = "none" }) => (
    <svg size="14" viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="m7 3 14 9-14 9V3z"/></svg>
  ),
  Save: () => (
    <svg size="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  ),
  Cpu: () => (
    <svg size="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
  ),
  Activity: () => (
    <svg size="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
  ),
  X: () => (
    <svg size="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
  Zap: ({ fill = "none" }) => (
    <svg size="20" viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
  ),
  Info: () => (
    <svg size="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
  ),
  AlertCircle: () => (
    <svg size="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
  ),
  Check: () => (
    <svg size="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>
  )
};

const mockFetchModels = async () => {
  return [
    { id: 'm1', name: 'GPT-4o Text', input: 'TEXT', output: 'JSON', category: 'Language' },
    { id: 'm2', name: 'Image Gen', input: 'TEXT', output: 'IMAGE', category: 'Image' },
    { id: 'm3', name: 'Whisper Audio', input: 'AUDIO', output: 'TEXT', category: 'Audio' },
    { id: 'm4', name: 'Sentiment', input: 'TEXT', output: 'NUMBER', category: 'Analysis' },
    { id: 'm5', name: 'Classifier', input: 'TENSOR', output: 'ARRAY', category: 'Vision' },
    { id: 'm6', name: 'SQL Query', input: 'SQL', output: 'DATASET', category: 'Data' },
    { id: 'm7', name: 'Translator', input: 'TEXT', output: 'TEXT', category: 'Language' },
  ];
};

const NODE_WIDTH = 240;

const getBezierPath = (from, to) => {
  const dx = Math.abs(to.x - from.x) * 0.45;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
};

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const [activeConnection, setActiveConnection] = useState(null); 
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [errorMsg, setErrorMsg] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  const canvasRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const data = await mockFetchModels();
      setAvailableModels(data);
      setIsLoading(false);
    };
    load();
  }, []);

  // Global Mouse Listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x, y });

      if (draggedNodeId) {
        setNodes(nds => nds.map(n => 
          n.id === draggedNodeId ? { ...n, x: x - dragOffset.x, y: y - dragOffset.y } : n
        ));
      }
    };

    const handleGlobalMouseUp = (e) => {
      setDraggedNodeId(null);
      if (activeConnection && !e.target.closest('.handle-area')) {
        setActiveConnection(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggedNodeId, dragOffset, activeConnection]);

  // Handle Save logic
  const handleSaveGraph = async () => {
    if (nodes.length === 0) {
      setErrorMsg("Cannot save an empty graph");
      return;
    }

    setSaveStatus('saving');
    
    // Prepare the DAG data
    const dag = {
      nodes: nodes.map(n => ({
        id: n.id,
        modelId: n.data.id,
        name: n.data.name,
        position: { x: n.x, y: n.y },
        specs: { input: n.data.input, output: n.data.output }
      })),
      edges: edges.map(e => ({
        id: e.id,
        from: e.from,
        to: e.to
      })),
      timestamp: new Date().toISOString()
    };

    // Simulate API Call
    console.log("Saving DAG structure:", dag);
    
    setTimeout(() => {
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    }, 800);
  };

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  const onSidebarDragStart = (e, model) => {
    e.dataTransfer.setData('model', JSON.stringify(model));
    setDraggedNodeId(null);
    setActiveConnection(null);
  };

  const onCanvasDrop = (e) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('model');
    if (!rawData) return;
    
    const modelData = JSON.parse(rawData);
    const rect = canvasRef.current.getBoundingClientRect();
    
    const newNode = {
      id: `node-${Date.now()}`,
      x: e.clientX - rect.left - (NODE_WIDTH / 2),
      y: e.clientY - rect.top - 25,
      data: modelData
    };

    setNodes(prev => [...prev, newNode]);
  };

  const handleHandleMouseDown = (e, node, type) => {
    e.stopPropagation();
    e.preventDefault();
    
    const startX = type === 'output' ? node.x + NODE_WIDTH + 8 : node.x - 8;
    const startY = node.y + 25;
    const dataType = type === 'output' ? node.data.output : node.data.input;

    setActiveConnection({
      nodeId: node.id,
      type: type,
      startX,
      startY,
      dataType
    });
  };

  const handleHandleMouseUp = (e, targetNode, targetType) => {
    e.stopPropagation();
    if (!activeConnection) return;

    const { nodeId: sourceId, type: sourceType, dataType: sourceData } = activeConnection;

    if (sourceId === targetNode.id) {
      setActiveConnection(null);
      return;
    }

    if (sourceType === targetType) {
      setErrorMsg(`Cannot connect ${sourceType} to ${targetType}`);
      setActiveConnection(null);
      return;
    }

    const inputData = targetType === 'input' ? targetNode.data.input : sourceData;
    const outputData = targetType === 'output' ? targetNode.data.output : sourceData;

    if (inputData !== outputData) {
      setErrorMsg(`Type mismatch: ${outputData} to ${inputData}`);
      setActiveConnection(null);
      return;
    }

    const fromNodeId = sourceType === 'output' ? sourceId : targetNode.id;
    const toNodeId = sourceType === 'input' ? sourceId : targetNode.id;

    const exists = edges.find(edge => edge.from === fromNodeId && edge.to === toNodeId);
    if (!exists) {
      setEdges(prev => [...prev, {
        id: `edge-${Date.now()}`,
        from: fromNodeId,
        to: toNodeId
      }]);
    }
    setActiveConnection(null);
  };

  const filteredModels = availableModels.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] font-sans text-slate-900 overflow-hidden select-none">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col z-30 shadow-xl overflow-visible">
        <div className="p-6 border-b border-slate-100 flex-shrink-0 bg-white z-20 sticky top-0">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icons.Search />
            </div>
            <input 
              type="text" 
              placeholder="Search models..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-md py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-orange-600/20 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar overflow-x-visible">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2 font-mono tracking-tighter">Registry</p>
          {isLoading ? (
            <div className="flex justify-center py-10">
               <div className="animate-spin text-orange-600"><Icons.Activity /></div>
            </div>
          ) : (
            filteredModels.map(model => (
              <div 
                key={model.id}
                draggable
                onDragStart={(e) => onSidebarDragStart(e, model)}
                className="group relative bg-white border border-slate-100 px-3 py-2.5 rounded-lg cursor-grab active:cursor-grabbing hover:border-orange-300 hover:shadow-md transition-all flex items-center justify-between hover:z-[100]"
              >
                <div className="absolute bottom-full left-0 right-0 h-4 hidden group-hover:block z-40" />
                
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 bg-[#0f172a] text-white p-3 rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-2xl invisible group-hover:visible translate-y-2 group-hover:translate-y-0 border border-slate-700 z-[110]">
                  <div className="flex items-center gap-2 mb-2 border-b border-slate-700 pb-1.5 font-mono">
                    <Icons.Info />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Specs</span>
                  </div>
                  <div className="space-y-1.5 text-[10px] font-mono">
                    <div className="flex justify-between bg-white/5 p-1 rounded px-2">
                      <span className="text-slate-500 italic uppercase text-[8px]">In</span>
                      <span className="text-orange-400 font-bold uppercase">{model.input}</span>
                    </div>
                    <div className="flex justify-between bg-white/5 p-1 rounded px-2">
                      <span className="text-slate-500 italic uppercase text-[8px]">Out</span>
                      <span className="text-green-400 font-bold uppercase">{model.output}</span>
                    </div>
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#0f172a]" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-50 rounded-md text-slate-400 group-hover:text-orange-600 transition-colors border border-slate-100">
                    <Icons.Cpu />
                  </div>
                  <span className="text-xs font-medium text-slate-600 truncate max-w-[140px]">{model.name}</span>
                </div>
                <div className="text-slate-300 group-hover:text-orange-600">
                  <Icons.Plus />
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Workspace */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white z-0">
        <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-6 z-20">
          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] font-mono">
            Flow Designer
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSaveGraph}
              disabled={saveStatus === 'saving'}
              className={`flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold transition-all border
                ${saveStatus === 'success' 
                  ? 'bg-green-50 text-green-600 border-green-200' 
                  : 'text-slate-600 hover:bg-slate-50 border-slate-200 active:bg-slate-100'}`}
            >
              {saveStatus === 'saving' ? (
                <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : saveStatus === 'success' ? (
                <Icons.Check />
              ) : (
                <Icons.Save />
              )}
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved' : 'Save Graph'}
            </button>
          </div>
        </header>

        <div 
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-[radial-gradient(#e2e8f0_1.5px,transparent_1px)] [background-size:24px_24px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onCanvasDrop}
          onMouseDown={() => {
            setDraggedNodeId(null);
            setActiveConnection(null);
          }}
        >
          {/* SVG Connector Layer */}
          <svg className="absolute inset-0 pointer-events-none w-full h-full">
            {edges.map(edge => {
              const fromNode = nodes.find(n => n.id === edge.from);
              const toNode = nodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              
              const start = { x: fromNode.x + NODE_WIDTH + 8, y: fromNode.y + 25 };
              const end = { x: toNode.x - 8, y: toNode.y + 25 };
              
              return (
                <g key={edge.id} className="group pointer-events-auto">
                  <path
                    d={getBezierPath(start, end)}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="14"
                    className="opacity-0 cursor-pointer hover:opacity-20 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdges(prev => prev.filter(ev => ev.id !== edge.id));
                    }}
                  />
                  <path
                    d={getBezierPath(start, end)}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {activeConnection && (
              <path
                d={activeConnection.type === 'output' 
                  ? getBezierPath({ x: activeConnection.startX, y: activeConnection.startY }, mousePos)
                  : getBezierPath(mousePos, { x: activeConnection.startX, y: activeConnection.startY })
                }
                fill="none"
                stroke="#ea580c"
                strokeWidth="2.5"
                strokeDasharray="8,5"
              />
            )}
          </svg>

          {/* Node Components */}
          {nodes.map(node => (
            <div
              key={node.id}
              className="absolute group select-none"
              style={{ 
                left: node.x, 
                top: node.y, 
                width: NODE_WIDTH,
                zIndex: draggedNodeId === node.id ? 100 : 10 
              }}
            >
              <div className="absolute bottom-full left-0 right-0 h-4 hidden group-hover:block z-40" />

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-44 bg-[#0f172a] text-white p-3 rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[60] shadow-2xl translate-y-2 group-hover:translate-y-0 border border-slate-700">
                <div className="flex items-center gap-2 mb-2 border-b border-slate-700 pb-1.5 font-mono">
                  <Icons.Info />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Specs</span>
                </div>
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div className="flex justify-between bg-white/5 p-1 rounded px-2">
                    <span className="text-slate-500 italic uppercase text-[8px]">In</span>
                    <span className="text-orange-400 font-bold uppercase">{node.data.input}</span>
                  </div>
                  <div className="flex justify-between bg-white/5 p-1 rounded px-2">
                    <span className="text-slate-500 italic uppercase text-[8px]">Out</span>
                    <span className="text-green-400 font-bold uppercase">{node.data.output}</span>
                  </div>
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#0f172a]" />
              </div>

              {/* Node Body */}
              <div 
                className={`relative flex items-center gap-3 bg-white border-2 px-3 py-2.5 rounded-2xl transition-all duration-200 
                  ${draggedNodeId === node.id ? 'border-orange-500 shadow-2xl scale-[1.01]' : 'border-slate-100 shadow-sm group-hover:border-slate-300 group-hover:shadow-md'}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDraggedNodeId(node.id);
                  setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
              >
                {/* INPUT HANDLE (LEFT) */}
                <div 
                  className="absolute -left-7 top-0 bottom-0 w-12 flex items-center justify-center z-30 handle-area cursor-crosshair"
                  onMouseDown={(e) => handleHandleMouseDown(e, node, 'input')}
                  onMouseUp={(e) => handleHandleMouseUp(e, node, 'input')}
                >
                  <div className={`w-6 h-6 rounded-full border-[4px] border-white shadow-sm transition-all duration-300
                    ${activeConnection ? 
                      ((activeConnection.type === 'output' && activeConnection.dataType === node.data.input) ? 'bg-green-500 scale-125 shadow-green-200 animate-pulse' : 'bg-red-400 scale-90 opacity-40') 
                      : 'bg-slate-200 hover:bg-orange-500 hover:scale-110'}`} 
                  />
                </div>

                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-orange-600 transition-colors">
                   <Icons.Cpu />
                </div>
                
                <span className="text-xs font-bold text-slate-700 truncate flex-1">{node.data.name}</span>

                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setNodes(prev => prev.filter(n => n.id !== node.id));
                    setEdges(prev => prev.filter(ev => ev.from !== node.id && ev.to !== node.id));
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-all"
                >
                  <Icons.X />
                </button>

                {/* OUTPUT HANDLE (RIGHT) */}
                <div 
                  className="absolute -right-7 top-0 bottom-0 w-12 flex items-center justify-center z-30 handle-area cursor-crosshair"
                  onMouseDown={(e) => handleHandleMouseDown(e, node, 'output')}
                  onMouseUp={(e) => handleHandleMouseUp(e, node, 'output')}
                >
                  <div className={`w-6 h-6 rounded-full border-[4px] border-white shadow-sm transition-all duration-300
                    ${activeConnection ? 
                      ((activeConnection.type === 'input' && activeConnection.dataType === node.data.output) ? 'bg-green-500 scale-125 shadow-green-200 animate-pulse' : 'bg-red-400 scale-90 opacity-40') 
                      : 'bg-slate-200 hover:bg-orange-600 hover:scale-110'}`} 
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Validation Feedback */}
          {errorMsg && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-[#0f172a] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 text-xs font-bold z-[100] border border-slate-700 animate-in fade-in slide-in-from-top-4 font-mono">
              <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                <Icons.AlertCircle />
              </div>
              {errorMsg.toUpperCase()}
            </div>
          )}

          {/* HUD Status Overlay */}
          <div className="absolute bottom-8 left-8 flex items-center gap-3 pointer-events-none">
            <div className="bg-[#0f172a]/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl text-[10px] font-bold shadow-2xl flex items-center gap-5 border border-white/5 tracking-wider font-mono">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="opacity-90 uppercase">Designer Online</span>
              </div>
              <div className="w-[1px] h-4 bg-white/20" />
              <div className="flex gap-5 opacity-70 uppercase tracking-widest text-[9px]">
                <span>{nodes.length} Models</span>
                <span>{edges.length} Links</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
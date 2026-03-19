'use client';

import { useState, useEffect } from 'react';
import { Network, Server, Wifi, Share2, ChevronRight, ChevronDown, Download, FileText, X, Monitor, Loader2 } from 'lucide-react';
import { usePDF } from 'react-to-pdf';
import { Device } from '@/types/network';

interface TopologyNode {
  id: string;
  ip: string;
  name: string;
  type: string;
  vendor?: string;
  children: TopologyNode[];
  connectionToParent?: {
    sourcePort: string;
    targetPort: string;
  };
}

interface TopologyMapProps {
  tree: TopologyNode[];
  isScanning?: boolean;
  devices?: Device[];
}

const NodeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'router': return <Server className="w-5 h-5 text-indigo-600" />;
    case 'switch': return <Network className="w-5 h-5 text-blue-600" />;
    case 'ap': return <Wifi className="w-5 h-5 text-amber-600" />;
    default: return <Server className="w-5 h-5 text-slate-600" />;
  }
};

const NetworkNode = ({ node, isRoot = false, isLast = false, onNodeClick }: { node: TopologyNode, isRoot?: boolean, isFirst?: boolean, isLast?: boolean, onNodeClick: (node: TopologyNode) => void }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li className="relative pt-4">
      {/* Horizontal line */}
      {!isRoot && (
        <div className="absolute -left-6 top-[80px] w-6 border-t-2 border-slate-300 -translate-y-1/2 z-0"></div>
      )}

      {/* Mask for last item to hide the vertical line tail */}
      {!isRoot && isLast && (
        <div className="absolute -left-[26px] top-[80px] bottom-0 w-[4px] bg-slate-50 z-0"></div>
      )}

      <div className="flex flex-col relative z-10">
        {/* Connection Badge */}
        {!isRoot && node.connectionToParent && (
          <div className="flex items-center gap-1 mb-2 ml-2 text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 w-fit h-[24px]">
            <span>[{node.connectionToParent.sourcePort}]</span>
            <span>➔</span>
            <span>[{node.connectionToParent.targetPort}]</span>
          </div>
        )}

        {/* Node Card */}
        <div 
          onClick={() => onNodeClick(node)}
          className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all w-72 h-[64px] cursor-pointer"
        >
          {hasChildren && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white border border-slate-300 rounded-full p-0.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50 z-20"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
          
          <div className={`p-2 rounded-lg ${
            node.type === 'router' ? 'bg-indigo-50' : 
            node.type === 'switch' ? 'bg-blue-50' : 
            node.type === 'ap' ? 'bg-amber-50' : 'bg-slate-50'
          }`}>
            <NodeIcon type={node.type} />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate" title={node.name}>
              {node.name}
            </p>
            <p className="text-xs font-mono text-slate-500 truncate">
              {node.ip}
            </p>
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <ul className="relative ml-6 pl-6 border-l-2 border-slate-300 mt-2">
          {node.children.map((child, index) => (
            <NetworkNode 
              key={child.id} 
              node={child} 
              isLast={index === node.children.length - 1} 
              onNodeClick={onNodeClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export default function TopologyMap({ tree, isScanning, devices = [] }: TopologyMapProps) {
  const { toPDF, targetRef } = usePDF({filename: 'network_topology.pdf'});
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [endDevices, setEndDevices] = useState<{ mac: string; port: string; ip?: string; vendor?: string }[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setIsLoadingDevices(true);
      fetch('/api/switch-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switchIp: selectedNode.ip })
      })
      .then(res => res.json())
      .then(data => {
        if (data.devices) {
          // Map MACs to IPs and Vendors using the devices array
          const enrichedDevices = data.devices.map((d: any) => {
            const knownDevice = devices.find(kd => kd.mac === d.mac);
            return {
              ...d,
              ip: knownDevice?.ip,
              vendor: knownDevice?.vendor
            };
          });
          setEndDevices(enrichedDevices);
        } else {
          setEndDevices([]);
        }
      })
      .catch(err => {
        console.error('Failed to fetch switch devices', err);
        setEndDevices([]);
      })
      .finally(() => {
        setIsLoadingDevices(false);
      });
    }
  }, [selectedNode, devices]);

  const exportToCSV = () => {
    const rows: string[][] = [];
    
    const traverse = (node: TopologyNode, depth: number) => {
      const row = new Array(depth).fill('""');
      row.push(`"${node.name}"`);
      row.push(`"${node.ip}"`);
      
      if (node.connectionToParent) {
        row.push(`"[${node.connectionToParent.sourcePort} -> ${node.connectionToParent.targetPort}]"`);
      } else {
        row.push('""');
      }
      
      rows.push(row);
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child, depth + 1));
      }
    };
    
    tree.forEach(root => traverse(root, 0));
    
    const maxCols = Math.max(...rows.map(r => r.length));
    const csvContent = rows.map(r => {
      while (r.length < maxCols) r.push('""');
      return r.join(',');
    }).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'network_topology.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isScanning) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
           <Share2 className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">Scanning Network...</h3>
        <p className="text-slate-500 mt-2">The topology map will be generated once the scan is complete.</p>
      </div>
    );
  }

  if (!tree || tree.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
           <Share2 className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No Topology Data</h3>
        <p className="text-slate-500 mt-2">Run a network scan to generate the topology map.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px] relative">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Network Structure</h3>
          <p className="text-sm text-slate-500">Hierarchical view of infrastructure devices</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => toPDF()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 flex">
        <div ref={targetRef} className="p-8 w-max min-w-full bg-slate-50">
          <ul className="space-y-8">
            {tree.map((rootNode) => (
              <NetworkNode key={rootNode.id} node={rootNode} isRoot={true} isLast={true} onNodeClick={setSelectedNode} />
            ))}
          </ul>
        </div>
      </div>

      {/* Side Panel for End-Devices */}
      {selectedNode && (
        <div className="absolute inset-y-0 right-0 w-80 bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 animate-in slide-in-from-right">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <h3 className="font-semibold text-slate-900">{selectedNode.name}</h3>
              <p className="text-xs text-slate-500">{selectedNode.ip}</p>
            </div>
            <button 
              onClick={() => setSelectedNode(null)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Connected End-Devices</h4>
            
            {isLoadingDevices ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mb-2 text-indigo-500" />
                <p className="text-sm">Querying FDB...</p>
              </div>
            ) : endDevices.length > 0 ? (
              <ul className="space-y-3">
                {endDevices.map((device, idx) => (
                  <li key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Monitor className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-mono font-medium text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {device.port}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {device.ip && (
                        <p className="text-sm font-medium text-slate-900">{device.ip}</p>
                      )}
                      <p className="text-xs font-mono text-slate-500">{device.mac}</p>
                      {device.vendor && (
                        <p className="text-xs text-slate-500 truncate">{device.vendor}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <Monitor className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No end-devices found on edge ports.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

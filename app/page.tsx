'use client';

import { useState } from 'react';
import ScannerForm from '@/components/scanner/ScannerForm';
import InventoryTable from '@/components/inventory/InventoryTable';
import TopologyMap from '@/components/topology/TopologyMap';
import { Network, Table2, Share2, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Device } from '@/types/network';

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [tree, setTree] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'topology'>('inventory');
  
  // Device Locator State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{ found: boolean, message: string } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResult(null);
    
    try {
      const switchIps = devices.filter(d => d.type === 'switch' || d.type === 'router').map(d => d.ip);
      
      if (switchIps.length === 0) {
        setSearchResult({
          found: false,
          message: 'Nenhum switch escaneado para realizar a busca.'
        });
        setIsSearching(false);
        return;
      }

      const res = await fetch('/api/locate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim(), switches: switchIps })
      });
      
      const data = await res.json();
      
      if (res.ok && data.found) {
        setSearchResult({
          found: true,
          message: `Dispositivo ${searchQuery} encontrado no equipamento ${data.switchName} na porta ${data.portName}`
        });
      } else {
        setSearchResult({
          found: false,
          message: data.error || `Dispositivo ${searchQuery} não encontrado na rede.`
        });
      }
    } catch (error) {
      setSearchResult({
        found: false,
        message: 'Erro ao buscar dispositivo.'
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
              <Network className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Network Topology Mapper</h1>
          </div>
          
          {/* Global Device Locator */}
          <div className="flex-1 max-w-lg ml-8">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Localizar dispositivo por IP ou MAC..."
                  className="block w-full pl-10 pr-3 py-1.5 border border-slate-300 rounded-lg leading-5 bg-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim() || devices.length === 0}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSearching ? 'Buscando...' : 'Buscar'}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Result Alert */}
        {searchResult && (
          <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 text-sm shadow-sm ${searchResult.found ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
            {searchResult.found ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <p className="font-medium text-base">{searchResult.message}</p>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Discover your network
          </h2>
          <p className="mt-2 text-lg text-slate-600">
            Enter CIDRs, IP ranges, or single IPs (comma-separated) to map out active devices, routers, and switches.
          </p>
        </div>

        <ScannerForm 
          onScanStart={() => {
            setDevices([]);
            setTree([]);
            setIsScanning(true);
            setSearchResult(null);
          }}
          onDeviceFound={(device) => {
            setDevices((prev) => {
              if (prev.some((d) => d.ip === device.ip)) return prev;
              return [...prev, device];
            });
          }}
          onScanComplete={(scannedTree) => {
            setIsScanning(false);
            if (scannedTree) {
              setTree(scannedTree);
            }
          }}
          isScanning={isScanning}
        />
        
        <div className="mt-8">
          <div className="border-b border-slate-200 mb-6">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('inventory')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors
                  ${activeTab === 'inventory' 
                    ? 'border-indigo-500 text-indigo-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
                `}
              >
                <Table2 className="w-4 h-4" />
                Inventory Table
              </button>
              <button
                onClick={() => setActiveTab('topology')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors
                  ${activeTab === 'topology' 
                    ? 'border-indigo-500 text-indigo-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
                `}
              >
                <Share2 className="w-4 h-4" />
                Topology Map
              </button>
            </nav>
          </div>

          <div className="transition-opacity duration-300">
            {activeTab === 'inventory' ? (
              <InventoryTable devices={devices} isScanning={isScanning} />
            ) : (
              <TopologyMap tree={tree} isScanning={isScanning} devices={devices} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

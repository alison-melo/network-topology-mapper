'use client';

import { useState } from 'react';
import { Play, Square, Loader2, Network, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Device } from '@/types/network';

interface ScannerFormProps {
  onScanStart: () => void;
  onDeviceFound: (device: Device) => void;
  onScanComplete: (tree?: any) => void;
  isScanning: boolean;
}

export default function ScannerForm({ onScanStart, onDeviceFound, onScanComplete, isScanning }: ScannerFormProps) {
  const [cidr, setCidr] = useState('192.168.1.0/24');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ scanned: number; total: number } | null>(null);
  const [isDone, setIsDone] = useState(false);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cidr) return;

    onScanStart();
    setError(null);
    setProgress(null);
    setIsDone(false);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cidr }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to start scan');
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          onScanComplete();
          setIsDone(true);
          break;
        }

        const chunk = decoder.decode(value);
        const messages = chunk.split('\n\n');
        
        for (const msg of messages) {
          if (!msg.trim()) continue;
          
          const msgLines = msg.split('\n');
          const eventLine = msgLines.find(l => l.startsWith('event: '));
          const dataLine = msgLines.find(l => l.startsWith('data: '));
          
          const eventType = eventLine ? eventLine.substring(7) : 'message';
          const dataStr = dataLine ? dataLine.substring(6) : '';

          if (eventType === 'done') {
            try {
              const data = JSON.parse(dataStr);
              onScanComplete(data.tree);
            } catch (e) {
              onScanComplete();
            }
            setIsDone(true);
            break;
          }
          
          if (eventType === 'progress') {
            try {
              const data = JSON.parse(dataStr);
              setProgress(data);
            } catch (e) {
              console.error('Error parsing progress data:', e);
            }
          }
          
          if (eventType === 'message' && dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (data && data.ip) {
                onDeviceFound(data);
              }
            } catch (e) {
              // Ignore parse errors for empty data or non-device data
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
      onScanComplete();
    }
  };

  const progressPercentage = progress ? Math.min(100, Math.round((progress.scanned / progress.total) * 100)) : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
          <Network className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Network Scanner</h2>
          <p className="text-sm text-slate-500">Discover devices using CIDR, IP ranges, or single IPs (comma-separated)</p>
        </div>
      </div>

      <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="cidr" className="sr-only">Network Targets</label>
          <input
            id="cidr"
            type="text"
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            placeholder="e.g., 192.168.1.0/24, 10.0.0.1-10.0.0.50, 172.16.0.5"
            disabled={isScanning}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
          />
        </div>
        
        <button
          type="submit"
          disabled={isScanning || !cidr}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-w-[140px]"
        >
          {isScanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Scan
            </>
          )}
        </button>
        
        {isScanning && (
          <button
            type="button"
            onClick={() => window.location.reload()} // Simple abort for now
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 font-medium rounded-lg hover:bg-rose-100 transition-all"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}
      </form>

      {/* Progress Indicator */}
      {isScanning && progress && (
        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-600 font-medium">Scanning network...</span>
            <span className="text-indigo-600 font-semibold">{progressPercentage}% ({progress.scanned} / {progress.total} IPs)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Completion Message */}
      {isDone && !isScanning && !error && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">Scan completed successfully!</p>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
          <p className="text-sm text-rose-800">{error}</p>
        </div>
      )}
    </div>
  );
}

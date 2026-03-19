import { Device } from '@/types/network';
import { Server, Router, SwitchCamera, Monitor, HelpCircle, Download, Smartphone, Printer, Wifi } from 'lucide-react';

interface InventoryTableProps {
  devices: Device[];
  isScanning: boolean;
}

export default function InventoryTable({ devices, isScanning }: InventoryTableProps) {
  const getDeviceIcon = (type: Device['type']) => {
    switch (type) {
      case 'router': return <Router className="w-4 h-4 text-indigo-500" />;
      case 'switch': return <SwitchCamera className="w-4 h-4 text-emerald-500" />;
      case 'ap': return <Wifi className="w-4 h-4 text-amber-500" />;
      case 'smartphone': return <Smartphone className="w-4 h-4 text-sky-500" />;
      case 'printer': return <Printer className="w-4 h-4 text-purple-500" />;
      case 'computer': return <Monitor className="w-4 h-4 text-blue-500" />;
      case 'end-device': return <Monitor className="w-4 h-4 text-slate-500" />;
      default: return <HelpCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const exportToCSV = () => {
    if (devices.length === 0) return;

    const headers = ['Status', 'IP Address', 'MAC Address', 'Hostname', 'Vendor', 'Type', 'Last Seen'];
    const rows = devices.map(d => [
      d.status,
      d.ip,
      d.mac || '',
      d.name || '',
      d.vendor || '',
      d.type,
      d.lastSeen
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `network_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Device Inventory</h3>
          <p className="text-sm text-slate-500 mt-1">
            {devices.length} {devices.length === 1 ? 'device' : 'devices'} discovered
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isScanning && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Scanning network...
            </div>
          )}
          <button
            onClick={exportToCSV}
            disabled={devices.length === 0 || isScanning}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
            <tr>
              <th scope="col" className="px-6 py-4">Status</th>
              <th scope="col" className="px-6 py-4">IP Address</th>
              <th scope="col" className="px-6 py-4">MAC Address</th>
              <th scope="col" className="px-6 py-4">Hostname / Name</th>
              <th scope="col" className="px-6 py-4">Vendor / Model</th>
              <th scope="col" className="px-6 py-4">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {devices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  {isScanning ? 'Discovering devices...' : 'No devices found. Start a scan to populate the inventory.'}
                </td>
              </tr>
            ) : (
              devices.map((device, idx) => (
                <tr key={device.id || idx} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${device.status === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                      <span className="capitalize font-medium text-slate-700">{device.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-slate-900">
                    {device.ip}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-slate-500">
                    {device.mac || <span className="text-slate-300 italic">Pending SNMP/ARP...</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {device.name ? (
                      <span className="font-medium text-slate-900">{device.name}</span>
                    ) : (
                      <span className="text-slate-400 italic">Unknown</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">{device.vendor || '-'}</span>
                      {device.sysObjectID && (
                        <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]" title={device.sysObjectID}>
                          {device.sysObjectID}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getDeviceIcon(device.type)}
                      <span className="capitalize text-slate-700">{device.type.replace('-', ' ')}</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

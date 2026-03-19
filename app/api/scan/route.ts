import { NextRequest } from 'next/server';
import { parseNetworkInput } from '@/lib/cidr';
import ping from 'ping';
import { Device } from '@/types/network';
import { queryBasicSnmpInfo, walkArpTable, getDeviceMacViaSnmp, getLldpNeighbors } from '@/lib/snmp';
import { getDeviceInfoFromMac } from '@/lib/mac-vendors';
import { buildTopologyTree } from '@/lib/topology';

export async function POST(req: NextRequest) {
  try {
    const { cidr } = await req.json();
    
    if (!cidr) {
      return new Response(JSON.stringify({ error: 'Network input is required' }), { status: 400 });
    }

    const ips = parseNetworkInput(cidr);

    // Create a ReadableStream to send Server-Sent Events (SSE)
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // We will ping IPs in batches to speed up the process
        const BATCH_SIZE = 20;
        let scannedCount = 0;
        const totalIps = ips.length;
        const allDevices: Device[] = [];
        
        for (let i = 0; i < ips.length; i += BATCH_SIZE) {
          const batch = ips.slice(i, i + BATCH_SIZE);
          
          // Ping all IPs in the batch concurrently
          const promises = batch.map(async (ip) => {
            try {
              // Timeout of 1 second for faster scanning
              const res = await ping.promise.probe(ip, { timeout: 1 });
              
              if (res.alive) {
                let device: Device = {
                  id: ip, // Fallback to IP initially
                  ip: ip,
                  status: 'up',
                  type: 'unknown',
                  lastSeen: new Date().toISOString(),
                };
                
                // Try to get SNMP info
                const snmpInfo = await queryBasicSnmpInfo(ip);
                if (snmpInfo) {
                  device = { ...device, ...snmpInfo };
                  
                  // Try to get its own MAC via SNMP
                  const mac = await getDeviceMacViaSnmp(ip);
                  if (mac) {
                    device.mac = mac;
                    device.id = mac; // Use MAC as ID if available
                    
                    // If we didn't get a vendor from SNMP sysObjectID, try MAC OUI
                    if (!device.vendor) {
                      const macInfo = getDeviceInfoFromMac(mac);
                      if (macInfo) {
                        device.vendor = macInfo.vendor;
                        // Only override type if SNMP didn't already classify it as switch/router
                        if (device.type === 'unknown' || device.type === 'end-device') {
                          device.type = macInfo.type;
                        }
                      }
                    }
                  }
                  
                  // If it's a switch/router, try to get its ARP table and LLDP neighbors
                  if (device.type === 'switch' || device.type === 'router') {
                    const [arpDevices, neighbors] = await Promise.all([
                      walkArpTable(ip),
                      getLldpNeighbors(ip)
                    ]);
                    device.endDevices = arpDevices;
                    device.neighbors = neighbors;
                  }
                }
                
                allDevices.push(device);
                // Send the discovered device to the client
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(device)}\n\n`));
              }
            } catch (err) {
              console.error(`Error pinging ${ip}:`, err);
            }
          });
          
          await Promise.all(promises);
          
          scannedCount += batch.length;
          controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify({ scanned: scannedCount, total: totalIps })}\n\n`));
        }
        
        // Build the topology tree
        const tree = buildTopologyTree(allDevices);
        
        // Signal that the scan is complete and send the tree
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ tree })}\n\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
}

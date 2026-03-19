import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Attempts to retrieve the MAC address for a given IP from the local ARP cache.
 * This works best for devices on the same local subnet.
 */
export async function getMacAddress(ip: string): Promise<string | null> {
  try {
    // Try standard arp -a command (works on Windows, Mac, and most Linux)
    const { stdout } = await execAsync(`arp -a ${ip}`);
    
    // Match standard MAC address formats: 00:11:22:33:44:55 or 00-11-22-33-44-55
    const macRegex = /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/;
    const match = stdout.match(macRegex);
    
    if (match) {
      return match[0].replace(/-/g, ':').toUpperCase();
    }
    
    // Fallback for some Linux systems using 'ip neigh'
    const { stdout: stdoutIp } = await execAsync(`ip neigh show ${ip}`);
    const matchIp = stdoutIp.match(macRegex);
    
    if (matchIp) {
      return matchIp[0].replace(/-/g, ':').toUpperCase();
    }
    
    return null;
  } catch (error) {
    // Command failed or IP not in ARP cache
    return null;
  }
}

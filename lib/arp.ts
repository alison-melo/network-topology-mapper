import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Basic IPv4 address regex to prevent command injection
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * Attempts to retrieve the MAC address for a given IP from the local ARP cache.
 * This works best for devices on the same local subnet.
 */
export async function getMacAddress(ip: string): Promise<string | null> {
  // --- SECURITY-FIX: VALIDATE IP ADDRESS ---
  // Prevent command injection by ensuring the input is a valid IPv4 address.
  if (!ipv4Regex.test(ip)) {
    console.error(`Security alert: Invalid IP format received: "${ip}". Aborting ARP lookup.`);
    return null; // Do not proceed with invalid input
  }
  // -----------------------------------------

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

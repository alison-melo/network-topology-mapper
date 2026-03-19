# NTM (Network Topology Mapper) 🌐

![Docker Image Version](https://img.shields.io/badge/docker%20image-latest-blue?logo=docker)
![CI/CD](https://img.shields.io/badge/build-passing-brightgreen?logo=githubactions)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)

**NTM** is a modern, open-source web application designed for network discovery and topology visualization. Built as a lightweight and highly responsive alternative to traditional tools (like LanTopolog), it provides IT and DevOps teams with a clear interface to map, visualize, and monitor infrastructure.

## 🚀 Quick Start (Production-Ready)

The easiest way to run NTM is using our pre-built, optimized Docker image hosted on the GitHub Container Registry (GHCR). You don't need to install Node.js or any local dependencies.

Run the following command in your terminal:

```bash
# Pull the latest image and run it on port 3000
docker run -d -p 3000:3000 --name ntm-app ghcr.io/alison-melo/network-topology-mapper:latest

import { Buffer } from "buffer";
import process from "process";

// The SDK pulls in node-only deps (blake-hash, readable-stream) that
// reference Buffer/process at module eval. Install the globals before any
// SDK import is reached.
const g = globalThis as unknown as { Buffer?: typeof Buffer; process?: typeof process };
if (!g.Buffer) g.Buffer = Buffer;
if (!g.process) g.process = process;

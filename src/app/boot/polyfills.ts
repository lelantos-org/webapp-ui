import { Buffer } from "buffer";
import process from "process";

// Must run before any SDK import: its node-only deps read Buffer/process at module eval.
const g = globalThis as unknown as { Buffer?: typeof Buffer; process?: typeof process };
if (!g.Buffer) g.Buffer = Buffer;
if (!g.process) g.process = process;

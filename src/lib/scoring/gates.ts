import { GATES } from './weights';

export interface GateResult {
  pass: boolean;
  value: number;
  threshold: number;
  reason: string;
}

export interface GateResults {
  need: GateResult;
  contact: GateResult;
}

export interface GateThresholds {
  need: number;
  contact: number;
}

function gate(name: string, value: number, threshold: number): GateResult {
  const pass = value >= threshold;
  return { pass, value, threshold, reason: `${name} ${value} ${pass ? '≥' : '<'} ${threshold}` };
}

export function evaluateGates(need: number, contact: number, thresholds: GateThresholds = GATES): GateResults {
  return { need: gate('N', need, thresholds.need), contact: gate('C', contact, thresholds.contact) };
}

export function gatesPass(gates: GateResults): boolean {
  return gates.need.pass && gates.contact.pass;
}

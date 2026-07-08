import type { CandidatePairType, RtpStats } from './types';

/**
 * Pure WebRTC getStats() parsing — no browser APIs, so it is fully unit-testable.
 * Takes the list of stat reports (Array.from(report.values())) plus the previous
 * byte/timestamp sample (for bitrate deltas) and returns ICE + RTP metrics.
 */

// Loosely typed stat report — WebRTC stats have many optional, type-specific fields.
export type StatLike = { type?: string; id?: string; [key: string]: unknown };

export interface RtpSample {
	timestamp: number;
	bytesReceived: number;
	bytesSent: number;
}

export interface ParsedStats {
	candidatePairType: CandidatePairType;
	localCandidateType: CandidatePairType;
	remoteCandidateType: CandidatePairType;
	rtp: RtpStats;
	sample: RtpSample;
}

export function emptyRtpStats(): RtpStats {
	return {
		jitterMs: 0,
		packetsLost: 0,
		packetLossPct: 0,
		rttMs: 0,
		inboundKbps: 0,
		outboundKbps: 0,
		codec: '—'
	};
}

export function emptyRtpSample(): RtpSample {
	return { timestamp: 0, bytesReceived: 0, bytesSent: 0 };
}

function candidateType(report?: StatLike): CandidatePairType {
	const t = report?.candidateType;
	if (t === 'host' || t === 'srflx' || t === 'prflx' || t === 'relay') return t;
	return 'unknown';
}

function num(v: unknown): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function round(v: number, decimals = 1): number {
	const f = 10 ** decimals;
	return Math.round(v * f) / f;
}

/** Picks the audio report, preferring kind/mediaType 'audio' but tolerating absent kind. */
function pickAudio(reports: StatLike[], type: string): StatLike | undefined {
	const ofType = reports.filter((r) => r.type === type);
	return ofType.find((r) => r.kind === 'audio' || r.mediaType === 'audio') ?? ofType[0];
}

export function parseStats(reports: StatLike[], prev?: RtpSample): ParsedStats {
	const byId = new Map<string, StatLike>();
	for (const r of reports) if (r.id) byId.set(r.id, r);

	// ---- ICE candidate pair ----
	let localType: CandidatePairType = 'unknown';
	let remoteType: CandidatePairType = 'unknown';
	let pairType: CandidatePairType = 'unknown';
	let selectedPair: StatLike | undefined;

	for (const r of reports) {
		if (r.type !== 'candidate-pair') continue;
		const selected = r.selected === true || r.nominated === true || r.state === 'succeeded';
		if (selected && (!selectedPair || r.nominated === true)) selectedPair = r;
	}

	if (selectedPair) {
		const local = byId.get(String(selectedPair.localCandidateId ?? ''));
		const remote = byId.get(String(selectedPair.remoteCandidateId ?? ''));
		localType = candidateType(local);
		remoteType = candidateType(remote);
		// Media go over relay if either side uses TURN.
		pairType = localType === 'relay' || remoteType === 'relay' ? 'relay' : localType;
	}

	// ---- RTP ----
	const inbound = pickAudio(reports, 'inbound-rtp');
	const outbound = pickAudio(reports, 'outbound-rtp');
	const remoteInbound = pickAudio(reports, 'remote-inbound-rtp');

	const packetsLost = num(inbound?.packetsLost);
	const packetsReceived = num(inbound?.packetsReceived);
	const totalPackets = packetsLost + packetsReceived;
	const packetLossPct = totalPackets > 0 ? round((packetsLost / totalPackets) * 100, 2) : 0;
	const jitterMs = round(num(inbound?.jitter) * 1000);

	// RTT: prefer the remote report, fall back to the candidate pair.
	const rttSeconds = remoteInbound?.roundTripTime ?? selectedPair?.currentRoundTripTime;
	const rttMs = round(num(rttSeconds) * 1000);

	// Codec label from the inbound codec report.
	let codec = '—';
	const codecReport = byId.get(String(inbound?.codecId ?? ''));
	if (codecReport && typeof codecReport.mimeType === 'string') {
		const name = codecReport.mimeType.split('/')[1] ?? codecReport.mimeType;
		const clock = num(codecReport.clockRate);
		codec = clock ? `${name}/${clock}` : name;
	}

	// Bitrate from byte deltas vs the previous sample.
	const bytesReceived = num(inbound?.bytesReceived);
	const bytesSent = num(outbound?.bytesSent);
	const timestamp = num(inbound?.timestamp) || num(outbound?.timestamp) || (prev?.timestamp ?? 0);

	let inboundKbps = 0;
	let outboundKbps = 0;
	if (prev && prev.timestamp > 0 && timestamp > prev.timestamp) {
		const deltaSec = (timestamp - prev.timestamp) / 1000;
		const dIn = bytesReceived - prev.bytesReceived;
		const dOut = bytesSent - prev.bytesSent;
		if (deltaSec > 0) {
			inboundKbps = dIn > 0 ? round((dIn * 8) / deltaSec / 1000) : 0;
			outboundKbps = dOut > 0 ? round((dOut * 8) / deltaSec / 1000) : 0;
		}
	}

	return {
		candidatePairType: pairType,
		localCandidateType: localType,
		remoteCandidateType: remoteType,
		rtp: { jitterMs, packetsLost, packetLossPct, rttMs, inboundKbps, outboundKbps, codec },
		sample: { timestamp, bytesReceived, bytesSent }
	};
}

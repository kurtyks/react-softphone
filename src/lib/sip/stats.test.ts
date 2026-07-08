import { describe, it, expect } from 'vitest';
import { parseStats, emptyRtpStats, emptyRtpSample, type StatLike } from './stats';

describe('parseStats — ICE candidate pair', () => {
	it('returns unknown for empty reports', () => {
		const r = parseStats([]);
		expect(r.candidatePairType).toBe('unknown');
		expect(r.localCandidateType).toBe('unknown');
		expect(r.remoteCandidateType).toBe('unknown');
	});

	it('detects a host pair from the selected candidate pair', () => {
		const reports: StatLike[] = [
			{ type: 'local-candidate', id: 'L', candidateType: 'host' },
			{ type: 'remote-candidate', id: 'R', candidateType: 'host' },
			{ type: 'candidate-pair', id: 'P', nominated: true, localCandidateId: 'L', remoteCandidateId: 'R' }
		];
		const r = parseStats(reports);
		expect(r.localCandidateType).toBe('host');
		expect(r.remoteCandidateType).toBe('host');
		expect(r.candidatePairType).toBe('host');
	});

	it('reports relay when either side uses TURN', () => {
		const reports: StatLike[] = [
			{ type: 'local-candidate', id: 'L', candidateType: 'host' },
			{ type: 'remote-candidate', id: 'R', candidateType: 'relay' },
			{ type: 'candidate-pair', id: 'P', state: 'succeeded', localCandidateId: 'L', remoteCandidateId: 'R' }
		];
		expect(parseStats(reports).candidatePairType).toBe('relay');
	});

	it('prefers the nominated pair over a merely succeeded one', () => {
		const reports: StatLike[] = [
			{ type: 'local-candidate', id: 'L1', candidateType: 'srflx' },
			{ type: 'remote-candidate', id: 'R1', candidateType: 'srflx' },
			{ type: 'local-candidate', id: 'L2', candidateType: 'relay' },
			{ type: 'remote-candidate', id: 'R2', candidateType: 'relay' },
			{ type: 'candidate-pair', id: 'P1', state: 'succeeded', localCandidateId: 'L1', remoteCandidateId: 'R1' },
			{ type: 'candidate-pair', id: 'P2', nominated: true, localCandidateId: 'L2', remoteCandidateId: 'R2' }
		];
		expect(parseStats(reports).candidatePairType).toBe('relay');
	});
});

describe('parseStats — RTP metrics', () => {
	it('computes packet loss percentage', () => {
		const reports: StatLike[] = [
			{ type: 'inbound-rtp', kind: 'audio', packetsLost: 10, packetsReceived: 90, jitter: 0 }
		];
		expect(parseStats(reports).rtp.packetLossPct).toBe(10);
		expect(parseStats(reports).rtp.packetsLost).toBe(10);
	});

	it('handles zero packets without dividing by zero', () => {
		const reports: StatLike[] = [{ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 0 }];
		expect(parseStats(reports).rtp.packetLossPct).toBe(0);
	});

	it('converts jitter from seconds to milliseconds', () => {
		const reports: StatLike[] = [{ type: 'inbound-rtp', kind: 'audio', jitter: 0.012 }];
		expect(parseStats(reports).rtp.jitterMs).toBe(12);
	});

	it('reads RTT from remote-inbound-rtp (seconds -> ms)', () => {
		const reports: StatLike[] = [
			{ type: 'inbound-rtp', kind: 'audio', jitter: 0 },
			{ type: 'remote-inbound-rtp', kind: 'audio', roundTripTime: 0.1 }
		];
		expect(parseStats(reports).rtp.rttMs).toBe(100);
	});

	it('falls back to candidate-pair RTT when no remote report', () => {
		const reports: StatLike[] = [
			{ type: 'candidate-pair', id: 'P', nominated: true, currentRoundTripTime: 0.25 }
		];
		expect(parseStats(reports).rtp.rttMs).toBe(250);
	});

	it('builds the codec label from the codec report', () => {
		const reports: StatLike[] = [
			{ type: 'inbound-rtp', kind: 'audio', codecId: 'C' },
			{ type: 'codec', id: 'C', mimeType: 'audio/opus', clockRate: 48000 }
		];
		expect(parseStats(reports).rtp.codec).toBe('opus/48000');
	});

	it('defaults codec to a dash when unavailable', () => {
		expect(parseStats([{ type: 'inbound-rtp', kind: 'audio' }]).rtp.codec).toBe('—');
	});

	it('prefers the audio inbound report when video is also present', () => {
		const reports: StatLike[] = [
			{ type: 'inbound-rtp', kind: 'video', packetsLost: 100, packetsReceived: 0 },
			{ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100 }
		];
		expect(parseStats(reports).rtp.packetLossPct).toBe(0);
	});
});

describe('parseStats — bitrate deltas', () => {
	it('computes kbps from byte deltas vs the previous sample', () => {
		const prev = { timestamp: 1000, bytesReceived: 0, bytesSent: 0 };
		const reports: StatLike[] = [
			{ type: 'inbound-rtp', kind: 'audio', bytesReceived: 20000, timestamp: 2000 },
			{ type: 'outbound-rtp', kind: 'audio', bytesSent: 10000, timestamp: 2000 }
		];
		const r = parseStats(reports, prev);
		// 20000 bytes * 8 / 1s / 1000 = 160 kbps; 10000 -> 80 kbps
		expect(r.rtp.inboundKbps).toBe(160);
		expect(r.rtp.outboundKbps).toBe(80);
	});

	it('returns zero bitrate without a previous sample', () => {
		const reports: StatLike[] = [{ type: 'inbound-rtp', kind: 'audio', bytesReceived: 20000, timestamp: 2000 }];
		const r = parseStats(reports);
		expect(r.rtp.inboundKbps).toBe(0);
		expect(r.rtp.outboundKbps).toBe(0);
	});

	it('returns zero bitrate on counter reset (negative delta)', () => {
		const prev = { timestamp: 1000, bytesReceived: 50000, bytesSent: 50000 };
		const reports: StatLike[] = [
			{ type: 'inbound-rtp', kind: 'audio', bytesReceived: 1000, timestamp: 2000 },
			{ type: 'outbound-rtp', kind: 'audio', bytesSent: 1000, timestamp: 2000 }
		];
		const r = parseStats(reports, prev);
		expect(r.rtp.inboundKbps).toBe(0);
		expect(r.rtp.outboundKbps).toBe(0);
	});

	it('returns the current sample for the next delta', () => {
		const reports: StatLike[] = [
			{ type: 'inbound-rtp', kind: 'audio', bytesReceived: 12345, timestamp: 5000 },
			{ type: 'outbound-rtp', kind: 'audio', bytesSent: 678 }
		];
		const r = parseStats(reports);
		expect(r.sample).toEqual({ timestamp: 5000, bytesReceived: 12345, bytesSent: 678 });
	});
});

describe('stat factories', () => {
	it('emptyRtpStats has zeroed metrics', () => {
		expect(emptyRtpStats()).toEqual({
			jitterMs: 0,
			packetsLost: 0,
			packetLossPct: 0,
			rttMs: 0,
			inboundKbps: 0,
			outboundKbps: 0,
			codec: '—'
		});
	});

	it('emptyRtpSample is zeroed', () => {
		expect(emptyRtpSample()).toEqual({ timestamp: 0, bytesReceived: 0, bytesSent: 0 });
	});
});

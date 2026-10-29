import {
  createAssistantProposal,
  haversineMeters,
} from './route-assistant.geometry';
import { fixtureInput } from './route-assistant.fixture';
import type { AssistantTransform } from './route-assistant.models';
import {
  transformPosition,
  validateAssistantInput,
} from './route-assistant.validation';

describe('assistant geometry', () => {
  it.each<AssistantTransform>([
    { origin: [0, 0.4], xAxis: [0.75, 0], yAxis: [0, 0.2], checks: [] },
    { origin: [0.8, 0.4], xAxis: [0.75, 0], yAxis: [0, 0.2], checks: [] },
    {
      origin: [0.95, 0.35],
      xAxis: [0.6, 0.15],
      yAxis: [-0.15, 0.2],
      checks: [],
    },
  ])(
    'keeps wide and rotated date-line points in the visible world: %j',
    (transform) => {
      const input = fixtureInput();
      transform.checks = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0.5, 0.5],
      ].map(([u, v]) => {
        const [x, y] = transformPosition(transform, u, v);
        return { u, v, x, y };
      });
      input.snapshot.transform = transform;
      const samples = [
        [0.95, 0.2],
        [0.6, 0.4],
      ];
      input.snapshot.waypoints = samples.map(([u, v], index) => {
        const [x, y] = transformPosition(transform, u, v);
        return {
          draftId: String(index),
          longitude: ((((x * 360) % 360) + 360) % 360) - 180,
          latitude:
            (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
          speedKmh: null,
          pauseSeconds: null,
        };
      });
      input.snapshot.visibleMarkers = samples.map(([u, v], index) => ({
        draftId: String(index),
        label: String(index + 1),
        u,
        v,
      }));
      expect(() =>
        validateAssistantInput(input, 'user', 'session', 1000000),
      ).not.toThrow();
      const entries = samples.map(([u, v], index) => ({
        kind: 'image',
        draftId: String(index),
        u,
        v,
      }));
      expect(
        createAssistantProposal(input, entries).waypoints.map((p) => p.draftId),
      ).toEqual(['0', '1']);
    },
  );

  it('requires intermediate visible points when a wide leg would take the unseen short arc', () => {
    const input = fixtureInput();
    input.snapshot.transform = {
      origin: [0, 0.4],
      xAxis: [0.75, 0],
      yAxis: [0, 0.2],
      checks: [],
    };
    const entry = (u: number) => ({ kind: 'image', u, v: 0.5 });
    expect(() =>
      createAssistantProposal(input, [entry(0.1), entry(0.9)]),
    ).toThrow('RA_OFFSCREEN_CONTEXT');
    expect(
      createAssistantProposal(input, [entry(0.1), entry(0.5), entry(0.9)])
        .waypoints,
    ).toHaveLength(3);
  });

  it('retains exact metadata and moves only visible identities', () => {
    const input = fixtureInput();
    const proposal = createAssistantProposal(input, [
      { kind: 'retain', draftId: 'b' },
      { kind: 'image', draftId: 'a', u: 0.5, v: 0.5 },
    ]);
    expect(proposal.waypoints[0]).toEqual(input.snapshot.waypoints[1]);
    expect(proposal.waypoints[1]).toEqual(input.snapshot.waypoints[0]);
    expect(proposal.removedEventIds).toEqual([]);
  });
  it('generates stable IDs/null defaults and tracks event removals', () => {
    const entries = [
      { kind: 'image', u: 0, v: 0 },
      { kind: 'image', u: 1, v: 1 },
    ];
    const proposal = createAssistantProposal(fixtureInput(), entries);
    expect(proposal).toEqual(createAssistantProposal(fixtureInput(), entries));
    expect(proposal.waypoints[0]).toMatchObject({
      draftId: 'run:0',
      speedKmh: null,
      pauseSeconds: null,
    });
    expect(proposal.removedEventIds).toEqual(['a']);
  });
  it.each([
    [
      { kind: 'retain', draftId: 'missing' },
      { kind: 'retain', draftId: 'a' },
    ],
    [
      { kind: 'retain', draftId: 'a' },
      { kind: 'retain', draftId: 'a' },
    ],
    [
      { kind: 'image', draftId: 'b', u: 0, v: 0 },
      { kind: 'retain', draftId: 'a' },
    ],
    [
      { kind: 'image', u: 0, v: 0, latitude: 5 },
      { kind: 'retain', draftId: 'a' },
    ],
    [
      { kind: 'image', u: NaN, v: 0 },
      { kind: 'retain', draftId: 'a' },
    ],
  ])('rejects unsafe references and raw coordinates %j', (...entries) => {
    expect(() => createAssistantProposal(fixtureInput(), entries)).toThrow();
  });
  it('enforces 2..1000 without simplification and retains sharp bends', () => {
    const entry = { kind: 'image', u: 0.5, v: 0.5 };
    expect(() => createAssistantProposal(fixtureInput(), [entry])).toThrow(
      'RA_POINT_LIMIT',
    );
    const entries = Array.from({ length: 1000 }, (_, i) => ({
      ...entry,
      u: i % 2,
      v: (i % 3) / 2,
    }));
    expect(
      createAssistantProposal(fixtureInput(), entries).waypoints,
    ).toHaveLength(1000);
    expect(() =>
      createAssistantProposal(fixtureInput(), [...entries, entry]),
    ).toThrow('RA_POINT_LIMIT');
  });
  it('retains offscreen legs only with their original neighbors', () => {
    const input = fixtureInput();
    const base = { speedKmh: null, pauseSeconds: null };
    input.snapshot.waypoints = [
      { ...base, draftId: 'A', latitude: 0, longitude: 0 },
      { ...base, draftId: 'B', latitude: 10, longitude: 10 },
      { ...base, draftId: 'C', latitude: 11, longitude: 11 },
      { ...base, draftId: 'D', latitude: 0, longitude: 0.1 },
    ];
    const retain = (draftId: string) => ({ kind: 'retain', draftId });
    expect(() =>
      createAssistantProposal(input, ['A', 'C', 'D'].map(retain)),
    ).toThrow('RA_OFFSCREEN_CONTEXT');
    expect(() =>
      createAssistantProposal(input, ['D', 'C', 'B', 'A'].map(retain)),
    ).toThrow('RA_OFFSCREEN_CONTEXT');
    expect(
      createAssistantProposal(input, ['A', 'B', 'C', 'D'].map(retain))
        .waypoints,
    ).toEqual(input.snapshot.waypoints);
    // A complete replacement inside the screenshot creates no unseen leg.
    expect(
      createAssistantProposal(input, [
        { kind: 'image', u: 0, v: 0 },
        { kind: 'image', u: 1, v: 1 },
      ]).waypoints,
    ).toHaveLength(2);
  });

  it('measures dateline distance using the short arc', () => {
    expect(
      haversineMeters(
        { latitude: 0, longitude: 179.999 },
        { latitude: 0, longitude: -179.999 },
      ),
    ).toBeCloseTo(222.39, 1);
  });
  it('validates loop closure and actual stored distance', () => {
    const input = fixtureInput();
    const entries = [
      { kind: 'image', u: 0.49, v: 0.49 },
      { kind: 'image', u: 0.51, v: 0.49 },
      { kind: 'image', u: 0.51, v: 0.51 },
      { kind: 'image', u: 0.49, v: 0.49 },
    ];
    const measured = createAssistantProposal(input, entries).distanceMeters;
    input.loopTargetMeters = measured;
    expect(createAssistantProposal(input, entries).distanceMeters).toBe(
      measured,
    );
    input.loopTargetMeters = 100;
    expect(() => createAssistantProposal(input, entries)).toThrow(
      'RA_LOOP_TOLERANCE',
    );
    input.loopTargetMeters = measured;
    expect(() => createAssistantProposal(input, entries.slice(0, 3))).toThrow(
      'RA_LOOP_TOLERANCE',
    );
    input.loopTargetMeters = 20001;
    expect(() => createAssistantProposal(input, entries)).toThrow(
      'RA_LOOP_TOLERANCE',
    );
  });
});

import type { Trade } from '@workspace/pin-repository';
import { createSupabaseUserRepository } from '@workspace/pin-repository';
import { otherSideTracking, tradeActionsFor, tradeCardTitle } from '../tradeActions';

const base: Trade = {
  id: 't1', initiatorId: 'a', recipientId: 'b', status: 'pending', createdAt: '', updatedAt: '',
};
const trade = (over: Partial<Trade>): Trade => ({ ...base, ...over });
const on = (actions: ReturnType<typeof tradeActionsFor>) =>
  Object.entries(actions).filter(([k, v]) => k !== 'nextStep' && v).map(([k]) => k).sort();

describe('tradeActionsFor', () => {
  it('lets only the recipient accept or decline a proposal', () => {
    expect(on(tradeActionsFor(trade({}), 'b'))).toEqual(['canAccept', 'canDecline']);
    expect(on(tradeActionsFor(trade({}), 'a'))).toEqual(['canCancel']);
  });

  it('gives a bystander nothing', () => {
    expect(on(tradeActionsFor(trade({ status: 'accepted' }), 'c'))).toEqual([]);
  });

  it('allows posting or cancelling once accepted, before anyone posts', () => {
    expect(on(tradeActionsFor(trade({ status: 'accepted' }), 'a'))).toEqual(['canCancel', 'canMarkPosted']);
  });

  it('stops cancelling after either side posts, and offers a problem report instead', () => {
    const t = trade({ status: 'accepted', initiatorPostedAt: 'x' });
    expect(on(tradeActionsFor(t, 'a'))).toEqual(['canReportProblem', 'canUpdateTracking']);
    expect(on(tradeActionsFor(t, 'b'))).toEqual(['canMarkPosted', 'canMarkReceived', 'canReportProblem']);
  });

  it('only offers received when the other side has posted, and only once', () => {
    const t = trade({ status: 'accepted', initiatorPostedAt: 'x', recipientPostedAt: 'y', recipientReceivedAt: 'z' });
    expect(tradeActionsFor(t, 'a').canMarkReceived).toBe(true);
    expect(tradeActionsFor(t, 'b').canMarkReceived).toBe(false);
    expect(tradeActionsFor(t, 'b').nextStep).toMatch(/Waiting/);
  });

  it.each(['completed', 'rejected', 'cancelled', 'problem'] as const)('offers nothing once %s', (status) => {
    expect(on(tradeActionsFor(trade({ status, initiatorPostedAt: 'x' }), 'a'))).toEqual([]);
  });
});

describe('otherSideTracking', () => {
  it("shows the other side's details, not your own", () => {
    const t = trade({ initiatorCarrier: 'Royal Mail', initiatorTracking: 'AB1', recipientTracking: 'CD2' });
    expect(otherSideTracking(t, 'b')).toBe('Royal Mail · AB1');
    expect(otherSideTracking(t, 'a')).toBe('CD2');
    expect(otherSideTracking(trade({}), 'a')).toBeUndefined();
  });
});

describe('tradeCardTitle', () => {
  it('only says agreed once the trade is accepted', () => {
    expect(tradeCardTitle('pending')).toBe('Trade proposed');
    expect(tradeCardTitle('accepted')).toBe('Trade agreed ✓');
  });
});

describe('repository trade calls', () => {
  const setup = (result: { data: unknown; error: unknown }) => {
    const rpc = jest.fn().mockResolvedValue(result);
    return { rpc, repo: createSupabaseUserRepository({ rpc } as never) };
  };
  const row = { id: 't1', initiator_id: 'a', recipient_id: 'b', status: 'accepted', recipient_tracking: 'X1' };

  it('calls the lifecycle functions, never a direct update', async () => {
    const { rpc, repo } = setup({ data: row, error: null });
    await repo.proposeTrade('b', 'hi');
    await repo.acceptTrade('t1');
    await repo.declineTrade('t1');
    await repo.cancelTrade('t1');
    await repo.markTradePosted('t1', { carrier: 'RM', tracking: 'X1' });
    await repo.markTradeReceived('t1');
    await repo.reportTradeProblem('t1');
    expect(rpc.mock.calls).toEqual([
      ['trade_propose', { p_recipient_id: 'b', p_notes: 'hi' }],
      ['trade_accept', { p_trade_id: 't1' }],
      ['trade_decline', { p_trade_id: 't1' }],
      ['trade_cancel', { p_trade_id: 't1' }],
      ['trade_mark_posted', { p_trade_id: 't1', p_carrier: 'RM', p_tracking: 'X1' }],
      ['trade_mark_received', { p_trade_id: 't1' }],
      ['trade_report_problem', { p_trade_id: 't1' }],
    ]);
  });

  it('rates through the function, with the ratee left to the server', async () => {
    const { rpc, repo } = setup({ data: { id: 'r1', trade_id: 't1', rater_id: 'a', ratee_id: 'b', is_positive: true }, error: null });
    await repo.createTradeRating({ tradeId: 't1', isPositive: true, comment: 'Nice' });
    expect(rpc).toHaveBeenCalledWith('trade_rate', { p_trade_id: 't1', p_is_positive: true, p_comment: 'Nice' });
  });

  it('maps the returned row', async () => {
    const { repo } = setup({ data: row, error: null });
    expect((await repo.acceptTrade('t1')).recipientTracking).toBe('X1');
  });

  it("passes on the server's message", async () => {
    const { repo } = setup({ data: null, error: { message: 'Only the other collector can accept this trade.' } });
    await expect(repo.acceptTrade('t1')).rejects.toThrow('Only the other collector');
  });
});

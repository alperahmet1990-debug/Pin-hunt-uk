import type { Trade } from '@workspace/pin-repository';
import { createSupabaseUserRepository } from '@workspace/pin-repository';
import {
  canProposeInChat,
  groupTrades,
  isOpenTrade,
  otherSideTracking,
  tradeActionsFor,
  tradeCardTitle,
  tradeStatusLabel,
} from '../tradeActions';

const base: Trade = {
  id: 't1', initiatorId: 'a', recipientId: 'b', status: 'pending', createdAt: '', updatedAt: '',
};
const trade = (over: Partial<Trade>): Trade => ({ ...base, ...over });
const on = (actions: ReturnType<typeof tradeActionsFor>) =>
  Object.entries(actions).filter(([k, v]) => k !== 'nextStep' && v).map(([k]) => k).sort();

describe('tradeActionsFor', () => {
  it('lets only the recipient accept or decline a proposal', () => {
    expect(on(tradeActionsFor(trade({}), 'b'))).toEqual(['canAccept', 'canDecline', 'canMessage']);
    expect(on(tradeActionsFor(trade({}), 'a'))).toEqual(['canCancel', 'canMessage']);
  });

  it('gives a bystander nothing', () => {
    expect(on(tradeActionsFor(trade({ status: 'accepted' }), 'c'))).toEqual([]);
  });

  it('allows posting or cancelling once accepted, before anyone posts', () => {
    expect(on(tradeActionsFor(trade({ status: 'accepted' }), 'a'))).toEqual(['canCancel', 'canMarkPosted', 'canMessage']);
  });

  it('stops cancelling after either side posts, and offers a problem report instead', () => {
    const t = trade({ status: 'accepted', initiatorPostedAt: 'x' });
    expect(on(tradeActionsFor(t, 'a'))).toEqual(['canMessage', 'canReportProblem', 'canUpdateTracking']);
    expect(on(tradeActionsFor(t, 'b'))).toEqual(['canMarkPosted', 'canMarkReceived', 'canMessage', 'canReportProblem']);
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

describe('problem trades', () => {
  it('tells both collectors the report is being reviewed', () => {
    const t = trade({ status: 'problem' });
    expect(tradeActionsFor(t, 'a').nextStep).toMatch(/reviewing/);
    expect(tradeActionsFor(t, 'b').nextStep).toMatch(/reviewing/);
    expect(tradeActionsFor(t, 'c').nextStep).toBeUndefined();
  });
});

describe('canMessage', () => {
  it('matches what the server accepts', () => {
    expect(tradeActionsFor(trade({}), 'a').canMessage).toBe(true);
    expect(tradeActionsFor(trade({ status: 'accepted' }), 'b').canMessage).toBe(true);
    for (const status of ['problem', 'completed', 'rejected', 'cancelled'] as const) {
      expect(tradeActionsFor(trade({ status }), 'a').canMessage).toBe(false);
    }
    expect(tradeActionsFor(trade({}), 'c').canMessage).toBe(false);
  });
});

describe('trade lists', () => {
  it('puts open trades first and keeps their order', () => {
    const t = (id: string, status: Trade['status']) => trade({ id, status });
    const { active, past } = groupTrades([
      t('1', 'completed'), t('2', 'problem'), t('3', 'cancelled'), t('4', 'pending'), t('5', 'accepted'), t('6', 'rejected'),
    ]);
    expect(active.map(x => x.id)).toEqual(['2', '4', '5']);
    expect(past.map(x => x.id)).toEqual(['1', '3', '6']);
  });

  it('treats exactly the states that can still need action as open', () => {
    expect(isOpenTrade('problem')).toBe(true);
    expect(isOpenTrade('completed')).toBe(false);
  });

  it('labels every status', () => {
    expect(tradeStatusLabel('pending')).toBe('Proposed');
    expect(tradeStatusLabel('rejected')).toBe('Declined');
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

describe('canProposeInChat', () => {
  it('offers a proposal in a chat with no trade', () => {
    expect(canProposeInChat(undefined, undefined)).toBe(true);
    expect(canProposeInChat(null, undefined)).toBe(true);
  });

  it('offers a new proposal once the last trade has finished', () => {
    for (const status of ['rejected', 'cancelled', 'completed'] as const) {
      expect(canProposeInChat('t1', status)).toBe(true);
    }
  });

  it('holds back while a trade is open or still loading', () => {
    for (const status of ['pending', 'accepted', 'problem', undefined] as const) {
      expect(canProposeInChat('t1', status)).toBe(false);
    }
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
    await repo.proposeTradeInChat('c1');
    await repo.acceptTrade('t1');
    await repo.declineTrade('t1');
    await repo.cancelTrade('t1');
    await repo.markTradePosted('t1', { carrier: 'RM', tracking: 'X1' });
    await repo.markTradeReceived('t1');
    await repo.reportTradeProblem('t1', 'Lost');
    expect(rpc.mock.calls).toEqual([
      ['trade_propose', { p_recipient_id: 'b', p_notes: 'hi' }],
      ['trade_propose_in_chat', { p_conversation_id: 'c1', p_notes: null }],
      ['trade_accept', { p_trade_id: 't1' }],
      ['trade_decline', { p_trade_id: 't1' }],
      ['trade_cancel', { p_trade_id: 't1' }],
      ['trade_mark_posted', { p_trade_id: 't1', p_carrier: 'RM', p_tracking: 'X1' }],
      ['trade_mark_received', { p_trade_id: 't1' }],
      ['trade_report_problem', { p_trade_id: 't1', p_reason: 'Lost' }],
    ]);
  });

  it('rates through the function, with the ratee left to the server', async () => {
    const { rpc, repo } = setup({ data: { id: 'r1', trade_id: 't1', rater_id: 'a', ratee_id: 'b', is_positive: true }, error: null });
    await repo.createTradeRating({ tradeId: 't1', isPositive: true, comment: 'Nice' });
    expect(rpc).toHaveBeenCalledWith('trade_rate', { p_trade_id: 't1', p_is_positive: true, p_comment: 'Nice' });
  });

  it('reads and closes problem reports through the admin functions', async () => {
    const { rpc, repo } = setup({
      data: [{ id: 't1', initiator_id: 'a', recipient_id: 'b', initiator_username: 'al', problem_reason: 'Lost' }],
      error: null,
    });
    const [report] = await repo.getProblemTrades();
    expect(report).toMatchObject({ id: 't1', initiatorUsername: 'al', reason: 'Lost' });
    await repo.resolveTradeProblem('t1', 'cancelled', 'Refunded');
    expect(rpc).toHaveBeenLastCalledWith('admin_resolve_trade_problem', {
      p_trade_id: 't1', p_outcome: 'cancelled', p_note: 'Refunded',
    });
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

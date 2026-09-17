import { shareBps, type Tallies, tallyBar } from "@/features/governance";
import { cx } from "@/shared/lib/cx";
import { formatShare, formatVotes } from "../governance-copy";

export interface TallyBarProps {
  tallies: Tallies;
  /// Undefined until the proposal's snapshot has passed.
  quorum: bigint | undefined;
  decimals: number;
  symbol: string;
  /// The list's one-line form: the bar and a short caption, no legend.
  compact?: boolean;
}

/// For, Abstain and Against on one bar, with the quorum marked.
export function TallyBar({ tallies, quorum, decimals, symbol, compact = false }: TallyBarProps) {
  const bar = tallyBar(tallies, quorum);
  const quorumText =
    quorum === undefined
      ? "Quorum set at snapshot"
      : bar.quorumReached
        ? "Quorum reached"
        : `Quorum ${formatVotes(bar.quorumVotes, decimals)} / ${formatVotes(quorum, decimals)} ${symbol}`;
  const summary = `For ${formatVotes(tallies.for, decimals)}, Against ${formatVotes(tallies.against, decimals)}, Abstain ${formatVotes(tallies.abstain, decimals)} ${symbol}. ${quorumText}.`;

  return (
    <div className={cx("gov-tally", compact && "gov-tally--compact")}>
      <div className="gov-tally__bar" role="img" aria-label={summary}>
        <span
          className="gov-tally__seg gov-tally__seg--for"
          style={{ width: formatShare(bar.forBps) }}
        />
        <span
          className="gov-tally__seg gov-tally__seg--abstain"
          style={{ width: formatShare(bar.abstainBps) }}
        />
        <span
          className="gov-tally__seg gov-tally__seg--against"
          style={{ width: formatShare(bar.againstBps) }}
        />
        {bar.quorumBps !== undefined ? (
          <span className="gov-tally__quorum" style={{ left: formatShare(bar.quorumBps) }} />
        ) : null}
      </div>
      {compact ? (
        <span className="gov-tally__caption">
          <span className={cx(bar.quorumReached && "gov-ok")}>{quorumText}</span>
        </span>
      ) : (
        <dl className="gov-tally__legend">
          {(
            [
              ["for", "For", tallies.for],
              ["against", "Against", tallies.against],
              ["abstain", "Abstain", tallies.abstain],
            ] as const
          ).map(([key, label, v]) => (
            <div key={key} className="gov-tally__item">
              <dt>
                <span className={`gov-dot gov-dot--${key}`} aria-hidden="true" />
                {label}
              </dt>
              <dd className="mono">
                {formatVotes(v, decimals)} {symbol}
                <span className="muted"> · {formatShare(shareBps(v, bar.total))}</span>
              </dd>
            </div>
          ))}
          <div className="gov-tally__item">
            <dt>Quorum (For + Abstain)</dt>
            <dd className={cx("mono", bar.quorumReached && "gov-ok")}>{quorumText}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

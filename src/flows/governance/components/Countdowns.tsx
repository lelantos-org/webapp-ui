import { formatDuration } from "../governance-copy";

export interface CountdownsProps {
  now: number;
  voteStart: number;
  voteEnd: number;
  quorumVoteDeadline?: number | undefined;
}

/// The two clocks a voter has to watch: when For/Abstain close, and when voting
/// closes altogether.
export function Countdowns({ now, voteStart, voteEnd, quorumVoteDeadline }: CountdownsProps) {
  const rows: [string, string][] = [];
  if (now <= voteStart) rows.push(["Voting opens", `in ${formatDuration(voteStart - now)}`]);
  if (quorumVoteDeadline !== undefined) {
    rows.push([
      "For / Abstain",
      now > quorumVoteDeadline ? "closed" : `close in ${formatDuration(quorumVoteDeadline - now)}`,
    ]);
  }
  rows.push(["Voting", now > voteEnd ? "closed" : `closes in ${formatDuration(voteEnd - now)}`]);
  return (
    <dl className="gov-clocks">
      {rows.map(([k, v]) => (
        <div key={k} className="gov-clocks__row">
          <dt>{k}</dt>
          <dd className="mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

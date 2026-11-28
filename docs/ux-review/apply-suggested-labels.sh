#!/usr/bin/env bash
# Maintainer-only helper for the Nov 2026 UX review issues (#667–#709).
#
# Agents can only file issues labelled `agent-proposed`. This adds the
# labels each issue body suggests (priority, autonomy, agent, size, area) so
# Agent ops can rank them. Review the list first; edit or delete lines freely.
#
#   bash docs/ux-review/apply-suggested-labels.sh            # labels only
#   APPROVE=1 bash docs/ux-review/apply-suggested-labels.sh  # also add `approved`
#                                                            # to the L1/L2 agent issues
#
# Requires an authenticated `gh` (your own account, not an agent session).
set -euo pipefail
REPO="alperahmet1990-debug/Pin-hunt-uk"

# number | labels (comma separated) | approvable by APPROVE=1 (y/n)
ISSUES=$(cat <<'LIST'
667|agent:ui,autonomy:L2,size:S,P1,area:pin-detail|y
668|agent:ui,autonomy:L2,size:S,P2,area:sets|y
669|agent:ui,autonomy:L2,size:S,P1,area:scan|y
670|agent:ui,autonomy:L1,size:S,P2,area:scan|y
671|agent:ui,autonomy:L1,size:S,P1,area:sets|y
672|agent:ui,autonomy:L1,size:S,P2,area:scan|y
673|agent:ui,autonomy:L2,size:S,P2,area:search|y
674|agent:ui,autonomy:L2,size:S,P2,area:sets|y
675|agent:ui,autonomy:L2,size:S,P2,area:collection|y
676|agent:ui,autonomy:L2,size:S,P1,area:trading|y
677|agent:ui,autonomy:L2,size:S,P1,area:trading|y
678|agent:ui,autonomy:L2,size:S,P1,area:trading|y
679|agent:ui,autonomy:L2,size:S,P2,area:trading|y
680|agent:ui,autonomy:L1,size:S,P1,area:trading|y
681|agent:ui,autonomy:L2,size:S,P2,area:trading|y
682|agent:ui,autonomy:L1,size:S,P2,area:trading|y
683|agent:ui,autonomy:L2,size:S,P1,area:profile|y
684|agent:ui,autonomy:L2,size:S,P1,area:collection|y
685|agent:ui,autonomy:L1,size:S,P1,area:compliance|y
686|agent:ui,autonomy:L2,size:S,P1,area:profile|y
687|agent:ui,autonomy:L3,size:S,P1,area:compliance,area:auth|n
688|agent:ui,autonomy:L3,size:S,P1,area:auth|n
689|agent:ui,autonomy:L2,size:S,P1,area:community|y
690|agent:ui,autonomy:L2,size:S,P2,area:profile|y
691|agent:ui,autonomy:L2,size:S,P1,area:community|y
692|agent:ui,autonomy:L2,size:S,P2,area:community|y
693|agent:ui,autonomy:L2,size:S,P1,area:messaging|y
694|agent:ui,autonomy:L1,size:S,P2,area:community|y
695|agent:ui,autonomy:L2,size:S,P2,area:messaging|y
696|agent:ui,autonomy:L2,size:S,P2,area:messaging|y
697|agent:ui,autonomy:L2,size:S,P1,area:home|y
698|agent:ui,autonomy:L2,size:S,P2,area:messaging|y
699|agent:ui,autonomy:L2,size:S,P1,area:catalogue|y
700|agent:ui,autonomy:L2,size:S,P1,area:catalogue|y
701|agent:ui,autonomy:L2,size:S,P2,area:catalogue|y
702|agent:ui,autonomy:L1,size:S,P1,area:valuation|y
703|agent:ui,autonomy:L2,size:S,P2,area:valuation|y
704|agent:ui,autonomy:L1,size:S,P2,area:valuation|y
705|agent:backend,autonomy:L2,size:S,P1,area:valuation,area:api|y
706|agent:ui,autonomy:L2,size:S,P1,area:valuation|y
707|human-only,P1,area:valuation|n
708|human-only,P2,area:ux|n
709|human-only,area:ux|n
752|human-only,P1,area:catalogue|n
753|agent:backend,autonomy:L2,size:S,P2,area:catalogue|y
754|agent:ui,autonomy:L2,size:S,P2,area:catalogue|y
755|agent:ui,autonomy:L1,size:S,P2,area:catalogue|y
756|agent:ui,autonomy:L1,size:S,P3,area:catalogue|y
757|agent:backend,autonomy:L3,size:S,P2,area:catalogue,area:db,area:performance|n
758|agent:ui,autonomy:L2,size:S,P2,area:catalogue|y
LIST
)

while IFS='|' read -r num labels approvable; do
  [ -z "$num" ] && continue
  args=()
  IFS=',' read -ra arr <<< "$labels"
  for l in "${arr[@]}"; do args+=(-f "labels[]=$l"); done
  if [ "${APPROVE:-0}" = "1" ] && [ "$approvable" = "y" ]; then args+=(-f "labels[]=approved"); fi
  gh api "repos/$REPO/issues/$num/labels" -X POST "${args[@]}" --silent
  echo "#$num: $labels$([ "${APPROVE:-0}" = "1" ] && [ "$approvable" = "y" ] && echo ',approved')"
done <<< "$ISSUES"

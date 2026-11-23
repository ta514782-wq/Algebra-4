import { FiniteGroup, NormalizerAnalysis } from './groupTypes.ts';
import { validateSubgroup } from './groupValidation.ts';

export function calculateNormalizer(
  group: FiniteGroup,
  subsetIndices: number[]
): NormalizerAnalysis {
  const validation = validateSubgroup(group, subsetIndices);
  const H = Array.from(new Set(subsetIndices))
    .filter((i) => i >= 0 && i < group.order)
    .sort((a, b) => a - b);
  const hKey = H.join(',');

  const normalizerIndices: number[] = [];
  const elementChecks: NormalizerAnalysis['elementChecks'] = [];

  for (let g = 0; g < group.order; g++) {
    const gInv = group.inverses[g];
    const conjSet = Array.from(
      new Set(H.map((h) => group.table[group.table[g][h]][gInv]))
    ).sort((a, b) => a - b);
    const inNorm = conjSet.join(',') === hKey;
    if (inNorm) normalizerIndices.push(g);
    elementChecks.push({
      gLabel: group.elements[g],
      inNormalizer: inNorm,
      conjugateSet: conjSet.map((i) => group.elements[i]),
    });
  }

  const normValidation = validateSubgroup(group, normalizerIndices);
  const hContained = H.every((h) => normalizerIndices.includes(h));
  const equalsG = normalizerIndices.length === group.order;

  const explanation = equalsG
    ? `N_G(H) = ${group.name} (order ${group.order}), which means H is normal in ${group.name}.`
    : `N_G(H) has order ${normalizerIndices.length} < ${group.order}, so N_G(H) is a proper subgroup of ${group.name}. H is normal inside N_G(H), but not in all of ${group.name}.`;

  return {
    isSubgroup: validation.isSubgroup,
    validation,
    normalizerIndices,
    normalizerLabels: normalizerIndices.map((i) => group.elements[i]),
    normalizerOrder: normalizerIndices.length,
    hContainedInNormalizer: hContained,
    normalizerIsSubgroup: normValidation.isSubgroup,
    equalsG,
    elementChecks,
    explanation,
  };
}

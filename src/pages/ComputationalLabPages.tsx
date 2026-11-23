import { AlertTriangle, CheckCircle2, Search, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { calculateCentralizer } from '../core/centralizerEngine.ts';
import { calculateCentre } from '../core/centreEngine.ts';
import { classifyAbelianGroup } from '../core/classificationEngine.ts';
import { analyzeConjugacyClasses } from '../core/conjugacyEngine.ts';
import { analyzeCosets } from '../core/cosetEngine.ts';
import { FiniteGroup } from '../core/groupTypes.ts';
import { validateSubgroup, verifyGroupAxioms } from '../core/groupValidation.ts';
import { identifyCanonicalGroupWithProof } from '../core/isomorphismEngine.ts';
import { verifyLagrangeTheorem } from '../core/lagrangeEngine.ts';
import { analyzeNormality } from '../core/normalityEngine.ts';
import { calculateNormalizer } from '../core/normalizerEngine.ts';
import { buildQuotientGroup } from '../core/quotientEngine.ts';
import { GroupSelectorBar } from '../components/GroupSelectorBar.tsx';
import { MathFormula, MathText } from '../components/MathFormula.tsx';
import {
  IsomorphismWitnessPanel,
  QuotientEpimorphismD3,
} from '../components/QuotientStructureVisuals.tsx';
import { SubgroupLatticeD3 } from '../components/SubgroupLatticeD3.tsx';
import {
  CayleyTableView,
  ConjugacyPartitionDiagram,
  CosetBlockedCayleyTable,
  CosetPartitionDiagram,
  ElementOrderChart,
} from '../components/VisualDiagrams.tsx';

interface LabProps {
  mode:
    | 'group-explorer'
    | 'cosets'
    | 'lagrange'
    | 'normality'
    | 'normalizer'
    | 'centralizer'
    | 'centre'
    | 'quotient'
    | 'classification'
    | 'conjugacy';
  group: FiniteGroup;
  selectedSubset: number[];
  onGroupChange: (g: FiniteGroup, initialSubset: number[]) => void;
  onSubsetChange: (indices: number[]) => void;
}

export function ComputationalLabPage({
  mode,
  group,
  selectedSubset,
  onGroupChange,
  onSubsetChange,
}: LabProps) {
  const [converseDivisor, setConverseDivisor] = useState<number>(6);
  const showSubsetBar = mode !== 'centre' && mode !== 'conjugacy';

  return (
    <div className="space-y-6">
      <GroupSelectorBar
        group={group}
        selectedSubset={selectedSubset}
        onGroupChange={onGroupChange}
        onSubsetChange={onSubsetChange}
        subsetLabel={mode === 'centralizer' ? 'Subset S' : 'Subgroup / Subset H'}
        showSubsetControls={showSubsetBar}
      />

      {mode === 'group-explorer' && (
        <GroupExplorerPanel group={group} selectedSubset={selectedSubset} onSubsetChange={onSubsetChange} />
      )}
      {mode === 'cosets' && <CosetVisualizerPanel group={group} selectedSubset={selectedSubset} />}
      {mode === 'lagrange' && (
        <LagrangeVerifierPanel
          group={group}
          selectedSubset={selectedSubset}
          targetDivisor={converseDivisor}
          onDivisorChange={setConverseDivisor}
          onSelectSubgroup={onSubsetChange}
        />
      )}
      {mode === 'normality' && <NormalityTesterPanel group={group} selectedSubset={selectedSubset} />}
      {mode === 'normalizer' && <NormalizerPanel group={group} selectedSubset={selectedSubset} />}
      {mode === 'centralizer' && <CentralizerPanel group={group} selectedSubset={selectedSubset} />}
      {mode === 'centre' && <CentrePanel group={group} />}
      {mode === 'quotient' && <QuotientBuilderPanel group={group} selectedSubset={selectedSubset} />}
      {mode === 'classification' && <QuotientClassificationPanel group={group} selectedSubset={selectedSubset} />}
      {mode === 'conjugacy' && <ConjugacyPanel group={group} />}
    </div>
  );
}

function GroupExplorerPanel({
  group,
  selectedSubset,
  onSubsetChange,
}: {
  group: FiniteGroup;
  selectedSubset: number[];
  onSubsetChange: (s: number[]) => void;
}) {
  const axioms = verifyGroupAxioms(group);
  const subVal = validateSubgroup(group, selectedSubset);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Group Axiom Verification
          </h2>
          <div className="space-y-2 text-xs">
            {[
              { label: 'Closure', ok: axioms.closure },
              { label: `Associativity (${axioms.checkedTriples.toLocaleString()} triples)`, ok: axioms.associativity },
              { label: `Identity (${axioms.identityElement ?? 'None'})`, ok: axioms.identity },
              { label: 'Inverses for all elements', ok: axioms.inverses },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                <span className="text-slate-700 dark:text-slate-300">{row.label}</span>
                <span className={`font-medium inline-flex items-center gap-1 ${row.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>
                  {row.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {row.ok ? 'Verified' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
          <div className="pt-2 text-xs text-slate-600 dark:text-slate-400">
            Subgroup Check for Selection:{' '}
            {subVal.isSubgroup ? <MathText text="Valid Subgroup H ≤ G" /> : 'Not a Subgroup'}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Element Orders & Inverses
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 px-2 text-left">Element <MathText text="g" /></th>
                  <th className="py-2 px-2 text-left">Inverse <MathText text="g⁻¹" /></th>
                  <th className="py-2 px-2 text-right">Order <MathText text="ord(g)" /></th>
                </tr>
              </thead>
              <tbody>
                {group.elements.slice(0, 24).map((_, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/60">
                    <td className="py-1.5 px-2 text-slate-900 dark:text-slate-100 font-medium">
                      <MathFormula latex={group.latexElements[idx]} />
                    </td>
                    <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">
                      <MathFormula latex={group.latexElements[group.inverses[idx]]} />
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-blue-700 dark:text-blue-400">{group.orders[idx]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Cayley Operation Table
          </h2>
          <CayleyTableView group={group} highlightIndices={selectedSubset} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Element-Order Distribution
          </h2>
          <ElementOrderChart group={group} />
        </div>
      </div>

      <SubgroupLatticeD3
        group={group}
        activeSubgroup={selectedSubset}
        onSelectSubgroup={onSubsetChange}
      />
    </div>
  );
}

function CosetVisualizerPanel({ group, selectedSubset }: { group: FiniteGroup; selectedSubset: number[] }) {
  const [visualView, setVisualView] = useState<'partition' | 'blocked-table'>('partition');
  const res = analyzeCosets(group, selectedSubset);

  if (!res.valid) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 space-y-2">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm">
          <XCircle className="w-4 h-4" />
          Cannot Generate Cosets: Selection is Not a Valid Subgroup
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">{res.validation.reasons.join(' ')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Group Order <MathText text="|G|" /></div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">{group.order}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Subgroup Order <MathText text="|H|" /></div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">{res.validation.order}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Index <MathText text="[G : H]" /></div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1 text-blue-700 dark:text-blue-400">{res.index}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Left = Right Cosets?</div>
          <div className={`text-sm font-semibold mt-1.5 inline-flex items-center gap-1.5 ${res.allLeftEqualRight ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {res.allLeftEqualRight ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {res.allLeftEqualRight ? <MathText text="Yes (H ◁ G)" /> : 'No (Differs)'}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Coset Partition of <MathText text={group.name} />
          </h2>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setVisualView('partition')}
              className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                visualView === 'partition' ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-500'
              }`}
            >
              Coset Partition Blocks
            </button>
            <button
              type="button"
              onClick={() => setVisualView('blocked-table')}
              className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                visualView === 'blocked-table' ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-500'
              }`}
            >
              Coset-Colored Cayley Table
            </button>
          </div>
        </div>
        {visualView === 'partition' ? (
          <CosetPartitionDiagram cosets={res} />
        ) : (
          <CosetBlockedCayleyTable group={group} cosets={res} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            All Left Cosets <MathText text="gH" /> ({res.distinctLeftCosets.length} distinct)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 text-left"><MathText text="g" /></th>
                  <th className="py-2 text-left">Left Coset</th>
                  <th className="py-2 text-left">Right Coset</th>
                  <th className="py-2 text-left">Equal?</th>
                </tr>
              </thead>
              <tbody>
                {res.leftCosets.map((lc, i) => {
                  const rc = res.rightCosets[i];
                  const eq = lc.elementIndices.join(',') === rc.elementIndices.join(',');
                  return (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60">
                      <td className="py-1.5 font-semibold"><MathText text={lc.representativeLabel} /></td>
                      <td className="py-1.5"><MathText text={`{${lc.elementLabels.join(', ')}}`} /></td>
                      <td className="py-1.5"><MathText text={`{${rc.elementLabels.join(', ')}}`} /></td>
                      <td className={`py-1.5 font-medium ${eq ? 'text-emerald-600' : 'text-red-600'}`}>
                        {eq ? 'Equal' : 'Differs'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Distinct Right Cosets ({res.distinctRightCosets.length}) & Mismatch Witnesses
          </h3>
          <div className="space-y-2">
            {res.distinctRightCosets.map((rc, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs">
                <span className="font-semibold"><MathText text={rc.cosetLabel} /></span> = <MathText text={`{${rc.elementLabels.join(', ')}}`} />
              </div>
            ))}
          </div>
          {res.mismatchWitnesses.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="text-xs font-semibold text-red-700 dark:text-red-400">
                Elements where <MathText text="gH ≠ Hg" /> ({res.mismatchWitnesses.length} witnesses):
              </div>
              {res.mismatchWitnesses.slice(0, 6).map((w, i) => (
                <div key={i} className="text-xs text-slate-600 dark:text-slate-400">
                  <MathText text={`g = ${w.element}: {${w.leftCoset.join(', ')}} ≠ {${w.rightCoset.join(', ')}}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LagrangeVerifierPanel({
  group,
  selectedSubset,
  targetDivisor,
  onDivisorChange,
  onSelectSubgroup,
}: {
  group: FiniteGroup;
  selectedSubset: number[];
  targetDivisor: number;
  onDivisorChange: (d: number) => void;
  onSelectSubgroup: (s: number[]) => void;
}) {
  const res = verifyLagrangeTheorem(group, selectedSubset, targetDivisor);
  const divisors = Array.from({ length: group.order }, (_, i) => i + 1).filter((d) => group.order % d === 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Lagrange's Theorem Verifier
            </h2>
            <MathFormula latex="|G| = |H| \times [G : H]" className="text-sm text-slate-600 dark:text-slate-400" />
          </div>
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
            res.equationVerified
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}>
            {res.equationVerified ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {res.equationVerified
              ? `Verified: ${res.groupOrder} = ${res.subgroupOrder} × ${res.index}`
              : 'Invalid Subgroup Selection'}
          </div>
        </div>

        <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {res.stepByStep.map((s, i) => (
            <li key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <MathText text={s} />
            </li>
          ))}
        </ol>
      </div>

      {/* Converse Investigation */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Investigating the Converse of Lagrange's Theorem
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              <MathText text={`Select any divisor d of |${group.name}| = ${group.order} to search for subgroups of order d. Try A₄ (order 12) with d = 6!`} />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {divisors.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDivisorChange(d)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                  targetDivisor === d
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <MathText text={`d = ${d}`} />
              </button>
            ))}
          </div>
        </div>

        {res.converseSearch && (
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Found {res.converseSearch.foundSubgroups.length} subgroup(s) of order {res.converseSearch.targetDivisor}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                Search Mode: {res.converseSearch.exhaustive ? 'Exhaustive Verified Lattice' : <MathText text="Resource-Limited (|G| > 24)" />}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              <MathText text={res.converseSearch.note} />
            </p>
            {res.converseSearch.foundSubgroups.length === 0 && group.id === 'A_4' && targetDivisor === 6 && (
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
                <MathText text="Counterexample Confirmed: |A₄| = 12 and 6 ∣ 12, yet A₄ has NO subgroup of order 6 (an index-2 subgroup would be normal and absorb all eight 3-cycles since every 3-cycle is a square!)." />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {res.converseSearch.foundSubgroups.slice(0, 10).map((sub, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectSubgroup(sub)}
                  className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs hover:border-blue-500"
                >
                  <MathText text={`{${sub.map((x) => group.elements[x]).join(', ')}}`} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NormalityTesterPanel({ group, selectedSubset }: { group: FiniteGroup; selectedSubset: number[] }) {
  const res = analyzeNormality(group, selectedSubset);
  const cosets = analyzeCosets(group, selectedSubset);
  const defaultWitnessIdx = res.conjugations.find((c) => !c.equalsH)?.gIndex ?? group.identityIndex;
  const [selectedG, setSelectedG] = useState<number>(defaultWitnessIdx);

  const safeG = selectedG < group.order ? selectedG : defaultWitnessIdx;
  const conjRow = res.conjugations.find((c) => c.gIndex === safeG) ?? res.conjugations[0];
  const leftCosetRow = cosets.leftCosets.find((c) => c.representativeIndex === safeG);
  const rightCosetRow = cosets.rightCosets.find((c) => c.representativeIndex === safeG);
  const gInv = group.inverses[safeG];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Normal Subgroup Detector
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              <MathText text={`Verifies both equivalent conditions: gHg⁻¹ = H and gH = Hg for all g ∈ ${group.name}.`} />
            </p>
          </div>
          <div className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
            res.isNormal
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}>
            {res.isNormal ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {res.isNormal ? <MathText text={`H ◁ ${group.name} (Normal)`} /> : <MathText text={`H ⋪ ${group.name} (Not Normal)`} />}
          </div>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <MathText text={res.explanation} />
        </p>

        {res.isSubgroup && conjRow && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Interactive Element Witness Inspector (Click any <MathText text="g ∈ G" /> below)
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Inspecting <MathFormula latex={`g = ${group.latexElements[safeG]},\\; g^{-1} = ${group.latexElements[gInv]}`} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-500">Left Coset <MathText text="gH" /></div>
                <div className="text-slate-900 dark:text-slate-100">
                  <MathText text={leftCosetRow ? `{${leftCosetRow.elementLabels.join(', ')}}` : '—'} />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-500">Right Coset <MathText text="Hg" /></div>
                <div className="text-slate-900 dark:text-slate-100">
                  <MathText text={rightCosetRow ? `{${rightCosetRow.elementLabels.join(', ')}}` : '—'} />
                </div>
              </div>
              <div className={`p-3 rounded-lg border space-y-1 ${
                conjRow.equalsH
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              }`}>
                <div className="font-semibold text-slate-600 dark:text-slate-300">
                  Conjugate <MathText text="gHg⁻¹" /> ({conjRow.equalsH ? 'Equals H' : '≠ H'})
                </div>
                <div className="text-slate-900 dark:text-slate-100">
                  <MathText text={`{${conjRow.conjugateLabels.join(', ')}}`} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {selectedSubset.slice(0, 12).map((hIdx) => {
                const conjEl = group.table[group.table[safeG][hIdx]][gInv];
                const inH = selectedSubset.includes(conjEl);
                return (
                  <div
                    key={hIdx}
                    className={`px-2.5 py-1 rounded-md border ${
                      inH
                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                        : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 font-medium'
                    }`}
                  >
                    <MathFormula
                      latex={`${group.latexElements[safeG]} \\cdot ${group.latexElements[hIdx]} \\cdot ${group.latexElements[gInv]} = ${group.latexElements[conjEl]} ${inH ? '\\in H' : '\\notin H'}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {res.isSubgroup && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 text-left"><MathText text="g ∈ G" /></th>
                  <th className="py-2 text-left">Conjugate <MathText text="gHg⁻¹" /></th>
                  <th className="py-2 text-left"><MathText text="gHg⁻¹ = H?" /></th>
                </tr>
              </thead>
              <tbody>
                {res.conjugations.slice(0, 24).map((c) => {
                  const isSel = c.gIndex === safeG;
                  return (
                    <tr
                      key={c.gIndex}
                      onClick={() => setSelectedG(c.gIndex)}
                      className={`border-b border-slate-100 dark:border-slate-800/60 cursor-pointer transition-colors ${
                        isSel ? 'bg-blue-50/80 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-1.5 px-2 font-semibold"><MathText text={c.gLabel} /></td>
                      <td className="py-1.5 px-2"><MathText text={`{${c.conjugateLabels.join(', ')}}`} /></td>
                      <td className={`py-1.5 px-2 font-medium ${c.equalsH ? 'text-emerald-600' : 'text-red-600'}`}>
                        {c.equalsH ? 'Equal' : 'Fails'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NormalizerPanel({ group, selectedSubset }: { group: FiniteGroup; selectedSubset: number[] }) {
  const res = calculateNormalizer(group, selectedSubset);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Normalizer Calculator <MathFormula latex="N_G(H)" />
          </h2>
          <MathFormula latex="N_G(H) = \{g \in G : gHg^{-1} = H\}" className="text-xs text-slate-500" />
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
          <MathFormula latex={`|N_G(H)| = ${res.normalizerOrder}`} /> · {res.equalsG ? <MathText text="Equals G" /> : 'Proper Subgroup'}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-sm text-blue-900 dark:text-blue-200">
        <MathFormula latex={`N_{${group.latexName}}(H) = \\{${res.normalizerIndices.map((i) => group.latexElements[i]).join(', ')}\\}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          <MathFormula latex="H \subseteq N_G(H)" />: <span className="font-semibold">{res.hContainedInNormalizer ? 'Verified' : 'No'}</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          <MathFormula latex="N_G(H) \le G" />: <span className="font-semibold">{res.normalizerIsSubgroup ? 'Verified Subgroup' : 'No'}</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          Distinct Conjugates <MathFormula latex="[G : N_G(H)]" />: <span className="font-semibold font-mono">{group.order / res.normalizerOrder}</span>
        </div>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300">
        <MathText text={res.explanation} />
      </p>
    </div>
  );
}

function CentralizerPanel({ group, selectedSubset }: { group: FiniteGroup; selectedSubset: number[] }) {
  const res = calculateCentralizer(group, selectedSubset);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Centralizer Calculator <MathFormula latex="C_G(S)" />
          </h2>
          <MathFormula latex="C_G(S) = \{g \in G : gs = sg \;\forall s \in S\}" className="text-xs text-slate-500" />
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
          <MathFormula latex={`|C_G(S)| = ${res.centralizerOrder}`} />
        </div>
      </div>

      <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-sm text-blue-900 dark:text-blue-200">
        <MathFormula latex={`C_{${group.latexName}}(S) = \\{${res.centralizerIndices.map((i) => group.latexElements[i]).join(', ')}\\}`} />
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        <MathText text={res.explanation} />
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <th className="py-2 text-left"><MathText text="g ∈ G" /></th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-left">Non-Commuting Witness</th>
            </tr>
          </thead>
          <tbody>
            {res.commutingPairs.slice(0, 24).map((p, idx) => (
              <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className="py-1.5 font-semibold"><MathText text={p.gLabel} /></td>
                <td className={`py-1.5 font-medium ${p.commutesWithAll ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {p.commutesWithAll ? <MathText text="Commutes with all s ∈ S" /> : 'Does not commute'}
                </td>
                <td className="py-1.5 text-red-600 dark:text-red-400">
                  {p.failingWitness ? <MathText text={p.failingWitness} /> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CentrePanel({ group }: { group: FiniteGroup }) {
  const res = calculateCentre(group);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Centre Calculator <MathFormula latex={`Z(${group.latexName}) = C_G(G)`} />
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <MathText text={`Elements commuting with every element of ${group.name}. Z(G) is always a normal subgroup of G.`} />
          </p>
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
          <MathFormula latex={`|Z(${group.latexName})| = ${res.centreOrder}`} /> · Normal Subgroup Verified
        </div>
      </div>

      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-sm">
        <MathFormula latex={`Z(${group.latexName}) = \\{${res.centreIndices.map((i) => group.latexElements[i]).join(', ')}\\}`} />
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        <MathText text={res.explanation} />
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {res.elementBreakdown.slice(0, 24).map((b, i) => (
          <div key={i} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              <MathText text={b.label} /> · {b.isCentral ? 'Central' : 'Non-central'}
            </div>
            {b.nonCommutingWith && (
              <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={b.nonCommutingWith}>
                <MathText text={b.nonCommutingWith} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function QuotientBuilderPanel({ group, selectedSubset }: { group: FiniteGroup; selectedSubset: number[] }) {
  const q = buildQuotientGroup(group, selectedSubset);
  const cosets = useMemo(() => analyzeCosets(group, selectedSubset), [group, selectedSubset]);
  const isoProof = useMemo(
    () => (q.canConstruct && q.quotientGroup ? identifyCanonicalGroupWithProof(q.quotientGroup) : null),
    [q]
  );

  if (!q.canConstruct || !q.quotientGroup) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 space-y-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-base">
            <XCircle className="w-5 h-5" />
            Quotient Group Construction Blocked
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            <MathText text={q.reasonIfInvalid ?? ''} />
          </p>
          {q.wellDefinedCounterexample && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs space-y-1.5">
              <div className="font-semibold text-red-800 dark:text-red-300">
                Explicit Failure of Well-Defined Coset Multiplication:
              </div>
              <div>
                <MathText text={`Choose g₁ = ${q.wellDefinedCounterexample.g1}, g₂ = ${q.wellDefinedCounterexample.g2} and h₁ = ${q.wellDefinedCounterexample.h1}, h₂ = ${q.wellDefinedCounterexample.h2} ∈ H.`} />
              </div>
              <div>
                <MathText text={`(g₁g₂)H = {${q.wellDefinedCounterexample.directProductCoset.join(', ')}}`} />
              </div>
              <div>
                <MathText text={`(g₁h₁)(g₂h₂)H = {${q.wellDefinedCounterexample.shiftedProductCoset.join(', ')}} ≠ (g₁g₂)H!`} />
              </div>
            </div>
          )}
        </div>

        {cosets.valid && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Visual Proof of Failure: Fractured Coset-Blocked Cayley Table
            </h3>
            <CosetBlockedCayleyTable group={group} cosets={cosets} />
          </div>
        )}
      </div>
    );
  }

  const qG = q.quotientGroup;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Quotient Order <MathText text="|G/H|" /></div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">{qG.order}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Matches <MathText text="[G : H]" />?</div>
          <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-1.5">
            {q.indexMatchesOrder ? <MathText text="Verified (|G|/|H|)" /> : 'Mismatch'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Identity Coset</div>
          <div className="text-sm font-bold mt-1.5">
            <MathFormula latex={qG.latexElements[q.identityCosetIndex ?? 0]} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Commutativity</div>
          <div className="text-sm font-semibold mt-1.5">
            {qG.isAbelian ? 'Abelian Quotient' : 'Non-Abelian Quotient'}
          </div>
        </div>
      </div>

      <QuotientEpimorphismD3 group={group} cosets={cosets} quotient={q} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Quotient Cayley Table (<MathFormula latex={qG.latexName} />)
          </h3>
          <CayleyTableView group={qG} />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Quotient Elements, Inverses & Orders
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 text-left">Coset <MathText text="gH" /></th>
                  <th className="py-2 text-left">Elements</th>
                  <th className="py-2 text-left"><MathText text="(gH)⁻¹" /></th>
                  <th className="py-2 text-right"><MathText text="ord(gH)" /></th>
                </tr>
              </thead>
              <tbody>
                {q.quotientElements?.map((el, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/60">
                    <td className="py-2 font-semibold text-blue-700 dark:text-blue-400">
                      <MathFormula latex={el.latexLabel} />
                    </td>
                    <td className="py-2"><MathText text={`{${el.memberLabels.join(', ')}}`} /></td>
                    <td className="py-2"><MathFormula latex={qG.latexElements[q.inverseCosetIndices![idx]]} /></td>
                    <td className="py-2 text-right font-mono font-semibold">{el.order}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <IsomorphismWitnessPanel proof={isoProof} />
    </div>
  );
}

function QuotientClassificationPanel({ group, selectedSubset }: { group: FiniteGroup; selectedSubset: number[] }) {
  const [targetMode, setTargetMode] = useState<'quotient' | 'group'>('quotient');
  const q = buildQuotientGroup(group, selectedSubset);

  const targetGroup = targetMode === 'quotient' && q.canConstruct && q.quotientGroup ? q.quotientGroup : group;
  const cls = classifyAbelianGroup(targetGroup);
  const isoProof = useMemo(() => identifyCanonicalGroupWithProof(targetGroup), [targetGroup]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Classification via Fundamental Theorem of Finite Abelian Groups
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Classifying: <MathFormula latex={targetGroup.latexName} /> (order {targetGroup.order})
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTargetMode('quotient')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${targetMode === 'quotient' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'}`}
            >
              Classify <MathText text="G/H" />
            </button>
            <button
              type="button"
              onClick={() => setTargetMode('group')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${targetMode === 'group' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'}`}
            >
              Classify <MathText text="G" /> Directly
            </button>
          </div>
        </div>

        {targetMode === 'quotient' && !q.canConstruct && (
          <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300">
            <MathText text={`Selected H is not normal in ${group.name}, so G/H does not exist. Showing classification of G directly instead.`} />
          </div>
        )}

        {!cls.isAbelian ? (
          <div className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
              <AlertTriangle className="w-4 h-4" />
              Non-Abelian Group Detected — Abelian Theorem Guard Active
            </div>
            <p className="text-xs text-red-700 dark:text-red-300">
              <MathText text={cls.explanation} />
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                <div className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                  Invariant-Factor Decomposition
                </div>
                <MathFormula latex={`${targetGroup.latexName} \\cong ${cls.canonicalLatex}`} display />
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Elementary-Divisor Decomposition
                </div>
                <MathFormula latex={cls.elementaryLatex} display />
              </div>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <MathText text={cls.explanation} />
            </p>
          </div>
        )}

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Element-Order Profile of <MathFormula latex={targetGroup.latexName} />
          </h3>
          <ElementOrderChart group={targetGroup} />
        </div>
      </div>

      <IsomorphismWitnessPanel proof={isoProof} />
    </div>
  );
}

function ConjugacyPanel({ group }: { group: FiniteGroup }) {
  const analysis = analyzeConjugacyClasses(group);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Conjugacy Classes & Class Equation of <MathFormula latex={group.latexName} />
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {analysis.classes.length} conjugacy classes · {analysis.centralElements.length} central element(s)
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Partition Sum: <MathFormula latex={`${analysis.sumOfSizes} = |G|`} />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
          <MathFormula latex={analysis.classEquationLatex} display />
        </div>

        <ConjugacyPartitionDiagram analysis={analysis} />
      </div>
    </div>
  );
}

void Search;

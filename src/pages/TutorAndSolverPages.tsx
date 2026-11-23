import { AlertTriangle, CheckCircle2, Download, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { GroupSelectorBar } from '../components/GroupSelectorBar.tsx';
import { MathFormula, MathText } from '../components/MathFormula.tsx';
import { FiniteGroup } from '../core/groupTypes.ts';
import { solveGroupProblem, SolverProblemType } from '../core/solverEngine.ts';
import { LEARNING_TOPICS } from '../data/topics.ts';
import { downloadSolverProofPdf } from '../utils/pdfExport.ts';

interface AiTutorPageProps {
  group: FiniteGroup;
  selectedSubset: number[];
  geminiConfigured: boolean;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  isFallback?: boolean;
}

export function AiTutorPage({ group, selectedSubset, geminiConfigured }: AiTutorPageProps) {
  const [topic, setTopic] = useState(LEARNING_TOPICS[0].title);
  const [mode, setMode] = useState<'simple' | 'proof' | 'example' | 'standard'>('standard');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text: `Ask any question about cosets, Lagrange's theorem, normal subgroups, normalizers, centralizers, quotient groups, or abelian classification. Your current active lab group is ${group.name} with selection {${selectedSubset.map((i) => group.elements[i]).join(', ')}}. Note: AI explanations are study guidance and never override verified computational engine proofs.`,
    },
  ]);

  const askTutor = async (customPrompt?: string) => {
    const q = (customPrompt ?? input).trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    if (!customPrompt) setInput('');
    setLoading(true);

    try {
      const resp = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          mode,
          question: q,
          contextSummary: `Active Group: ${group.name} (order ${group.order}, ${group.isAbelian ? 'abelian' : 'non-abelian'}), H = {${selectedSubset.map((i) => group.elements[i]).join(', ')}}`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        // Provide honest error + built-in verified topic note fallback
        const matchedTopic =
          LEARNING_TOPICS.find((t) => t.title.toLowerCase().includes(topic.toLowerCase().split(' ')[0])) ??
          LEARNING_TOPICS[0];
        const keyLatex = matchedTopic.formulas[0]?.latex ? `$${matchedTopic.formulas[0].latex}$` : '';
        const fallbackNote = `AI Service Notice: ${data.error}\n\nBuilt-in Verified Reference (${matchedTopic.title}):\n${matchedTopic.introduction}\nKey Formula: ${keyLatex}\nSolved Example (${matchedTopic.solvedExamples[0]?.title}): ${matchedTopic.solvedExamples[0]?.steps.join(' ')} → ${matchedTopic.solvedExamples[0]?.answer}`;
        setMessages((prev) => [...prev, { role: 'assistant', text: fallbackNote, isFallback: true }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Network error reaching the tutor endpoint. Check your connection or use the built-in Learn Mathematics notes and Step-by-Step Solver.',
          isFallback: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              AI Algebra Tutor
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {geminiConfigured
                ? 'Server-side Gemini tutoring active · Verified math logic remains strictly separated in the engine'
                : 'Built-in Verified Notes Mode (configure GEMINI_API_KEY in Secrets for live AI responses)'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              {LEARNING_TOPICS.map((t) => (
                <option key={t.id} value={t.title}>
                  {t.title}
                </option>
              ))}
            </select>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="standard">Balanced Explanation</option>
              <option value="simple">Simple Intuition</option>
              <option value="proof">Rigorous Proof</option>
              <option value="example">Worked Example</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            'Why is gH = Hg equivalent to gHg⁻¹ = H?',
            'Explain why A₄ has no subgroup of order 6',
            'Contrast normalizer N_G(H) vs centralizer C_G(H)',
            'Why is D₄/⟨r²⟩ isomorphic to V₄?',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => askTutor(preset)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-blue-500 text-xs text-slate-700 dark:text-slate-300"
            >
              <MathText text={preset} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-lg text-sm whitespace-pre-line ${
                m.role === 'user'
                  ? 'bg-blue-700 text-white ml-8'
                  : m.isFallback
                    ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-slate-800 dark:text-slate-200 mr-8'
                    : 'bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 mr-8'
              }`}
            >
              {m.role === 'assistant' && (
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  {m.isFallback ? <AlertTriangle className="w-3 h-3 text-amber-600" /> : <Sparkles className="w-3 h-3 text-blue-600" />}
                  {m.isFallback ? 'Verified Built-In Study Fallback' : 'AI Study Guidance (Non-Authoritative)'}
                </div>
              )}
              <MathText text={m.text} />
            </div>
          ))}
          {loading && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-500">
              Generating mathematical explanation…
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            askTutor();
          }}
          className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about cosets, normality, quotient groups, or proofs…"
            className="flex-1 h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Ask Tutor
          </button>
        </form>
      </div>
    </div>
  );
}

export function StepByStepSolverPage({
  group,
  selectedSubset,
  onGroupChange,
  onSubsetChange,
}: {
  group: FiniteGroup;
  selectedSubset: number[];
  onGroupChange: (g: FiniteGroup, initialSubset: number[]) => void;
  onSubsetChange: (indices: number[]) => void;
}) {
  const [problemType, setProblemType] = useState<SolverProblemType>('quotient');
  const solution = solveGroupProblem(problemType, group, selectedSubset);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Step-by-Step Mathematical Solver
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Select a problem type and group/subgroup below. Every intermediate calculation and verification is executed directly by the deterministic group-theory engine.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(
            [
              ['cosets', 'Cosets & Index'],
              ['lagrange', "Lagrange's Theorem"],
              ['normality', 'Normality Test'],
              ['normalizer', 'Normalizer N_G(H)'],
              ['centralizer', 'Centralizer C_G(S)'],
              ['centre', 'Centre Z(G)'],
              ['quotient', 'Quotient Group G/H'],
              ['classification', 'Abelian Classification'],
              ['conjugacy', 'Conjugacy & Class Eq.'],
            ] as Array<[SolverProblemType, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setProblemType(id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 ${
                problemType === id
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <MathText text={label} />
            </button>
          ))}
        </div>
      </div>

      <GroupSelectorBar
        group={group}
        selectedSubset={selectedSubset}
        onGroupChange={onGroupChange}
        onSubsetChange={onSubsetChange}
        showSubsetControls={problemType !== 'centre' && problemType !== 'conjugacy'}
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            <MathText text={solution.problemTitle} />
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              {solution.verifiedByEngine ? 'Verified by Group Engine' : 'Engine Flagged'}
            </div>
            <button
              type="button"
              onClick={() => downloadSolverProofPdf(solution)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export Proof PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-semibold text-slate-600 dark:text-slate-400">Given Information</div>
            {solution.givenInfo.map((g, i) => (
              <div key={i} className="text-slate-900 dark:text-slate-100">
                <MathText text={g} />
              </div>
            ))}
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-semibold text-slate-600 dark:text-slate-400">Required Result & Theorem</div>
            <div className="text-slate-800 dark:text-slate-200">
              <MathText text={solution.requiredResult} />
            </div>
            <div className="text-blue-700 dark:text-blue-400 font-medium">{solution.relevantTheorem}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
          <MathFormula latex={solution.formulaLatex} display />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Verified Calculation Steps
          </div>
          {solution.steps.map((s, i) => (
            <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200">
              <MathText text={s} />
            </div>
          ))}
        </div>

        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-1">
          <div className="text-xs font-semibold text-blue-800 dark:text-blue-300">Final Answer</div>
          <div className="text-sm font-bold text-blue-900 dark:text-blue-100">
            <MathText text={solution.finalAnswer} />
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300">
            <MathText text={solution.verificationSummary} />
          </div>
        </div>
      </div>
    </div>
  );
}

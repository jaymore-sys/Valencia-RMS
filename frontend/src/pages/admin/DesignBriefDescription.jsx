import { designRequestQuestionnaires, designRequestTypeLabel } from "./designRequestQuestionnaires";
import "./designRequests.css";

function briefLabels(category) {
  const questionnaires = category ? [designRequestQuestionnaires[category]] : Object.values(designRequestQuestionnaires);
  const labels = new Set([designRequestTypeLabel, "Additional brief", "Additional attachments", "Labelling documents", "What is the target audience?", "Target audience comments", "Target audience comments (optional)"]);
  for (const field of questionnaires.flatMap(item => item?.fields || [])) {
    for (const label of [field.label, field.note?.label, field.upload].filter(Boolean)) {
      labels.add(label);
      labels.add(`${label} (optional)`);
    }
  }
  return labels;
}

export function readBriefAnswers(request) {
  const labels = briefLabels(request.category);
  const answers = [];
  const brief = (request.brief || "").replace(/\r\n?/g, "\n").trim();
  for (const block of brief.split(/\n[ \t]*\n+/).filter(Boolean)) {
    const lineEnd = block.indexOf("\n");
    const label = block.slice(0, lineEnd);
    if (lineEnd > 0 && labels.has(label)) {
      answers.push({ label, value: block.slice(lineEnd + 1) });
    } else if (answers.length) {
      answers[answers.length - 1].value += `\n\n${block}`;
    } else {
      answers.push({ value: block });
    }
  }
  return answers;
}

const escapeRegex = label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function readLegacyBrief(text) {
  const labels = [...briefLabels()].filter(label => label.length > 8).sort((a, b) => b.length - a.length);
  const labelPattern = labels.map(escapeRegex).join("|");
  const source = String(text || "").trim();
  const matches = [...source.matchAll(new RegExp("(^|\\s)(" + labelPattern + ")(?=\\s|:)", "gi"))];
  if (!matches.length || matches[0].index !== 0) return [];
  const noteIndex = matches.findIndex(match => /^Additional brief$/i.test(match[2]));
  const fields = noteIndex < 0 ? matches : matches.slice(0, noteIndex + 1);
  if (fields.filter(match => /\?/.test(match[2])).length < 2) return [];
  return fields.map((match, index) => ({
    label: match[2],
    value: source.slice(match.index + match[0].length, fields[index + 1]?.index ?? source.length)
      .replace(/^:\s*/, "").trim(),
  })).filter(answer => answer.value);
}

function BriefRows({ answers }) {
  return <dl className="dr-brief-description">
    {answers.map(({ label, value }, index) => <div key={index}>
      {label && <dt>{label}</dt>}
      <dd>{value}</dd>
    </div>)}
  </dl>;
}

export default function DesignBriefDescription({ text, fallback }) {
  const structured = readBriefAnswers({ brief: text });
  const recognized = structured.filter(answer => answer.label);
  const answers = recognized.some(answer => answer.label === designRequestTypeLabel) || recognized.length >= 2
    ? structured : readLegacyBrief(text);
  if (!answers.length) return fallback || <p>{text || "–"}</p>;

  const previewCount = 4;
  return <div className="dr-brief-summary">
    <BriefRows answers={answers.slice(0, previewCount)} />
    {answers.length > previewCount && <details>
      <summary>View full Design brief</summary>
      <BriefRows answers={answers.slice(previewCount)} />
    </details>}
  </div>;
}

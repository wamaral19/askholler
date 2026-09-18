import {
  parseReportRenderModel,
  type AngleMetric,
  type AngleRenderModel,
  type ReportRenderModel,
} from "./models";

const TEMPLATE_STYLES = `
body{font-family:ui-sans-serif,system-ui,sans-serif;color:#17211b;line-height:1.5;margin:0;background:#f6f7f4}
main{max-width:960px;margin:0 auto;padding:48px 36px;background:#fff}
h1,h2,h3{line-height:1.15}h1{font-size:2.4rem}h2{margin-top:2.5rem;border-bottom:1px solid #d8ddd8;padding-bottom:.45rem}
.meta,.label{color:#526159}.angle{break-inside:avoid;margin:1.5rem 0;padding:1.25rem;border:1px solid #d8ddd8;border-radius:10px}
.metric{margin:.5rem 0}.source{font-weight:650}.caveat{background:#f4f1e9;padding:.75rem}.evidence{font-size:.9rem}code{overflow-wrap:anywhere}
`;

export function renderReportHtml(input: unknown): string {
  const report = parseReportRenderModel(input);
  const anglesById = new Map(report.angles.map((angle) => [angle.id, angle]));
  const executiveAngles = report.executiveAngleIds.map((id) => {
    const angle = anglesById.get(id);
    if (angle === undefined)
      throw new Error("Validated executive Angle is missing");
    return angle;
  });

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(report.title)}</title>`,
    `<style>${TEMPLATE_STYLES}</style>`,
    "</head>",
    "<body>",
    "<main>",
    `<header><p class="label">Monthly Angles Report</p><h1>${escapeHtml(report.title)}</h1>`,
    `<p>${escapeHtml(report.merchantName)}</p><p class="meta">${escapeHtml(report.period.displayMonth)} · Generated ${escapeHtml(report.generatedAt)} · Template ${escapeHtml(report.templateVersion)}</p></header>`,
    '<section aria-labelledby="executive-summary"><h2 id="executive-summary">Executive summary</h2>',
    ...executiveAngles.map(renderExecutiveAngle),
    "</section>",
    '<section aria-labelledby="detailed-angles"><h2 id="detailed-angles">Detailed Angles</h2>',
    ...report.angles.map(renderDetailedAngle),
    "</section>",
    '<section aria-labelledby="methodology"><h2 id="methodology">Methodology</h2>',
    `<p>${escapeHtml(report.methodology)}</p></section>`,
    '<section aria-labelledby="sample-notes"><h2 id="sample-notes">Sample notes</h2>',
    `<p>${escapeHtml(report.sampleNotes)}</p></section>`,
    `<footer class="meta">Report <code>${escapeHtml(report.reportId)}</code> · Revision <code>${escapeHtml(report.revisionId)}</code></footer>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderExecutiveAngle(angle: AngleRenderModel): string {
  return [
    `<article class="angle" data-angle-id="${escapeHtml(angle.id)}">`,
    `<h3>${escapeHtml(angle.title)}</h3>`,
    `<p>${escapeHtml(angle.summary)}</p>`,
    `<p><strong>Recommended action:</strong> ${escapeHtml(angle.recommendedAction)}</p>`,
    "</article>",
  ].join("\n");
}

function renderDetailedAngle(angle: AngleRenderModel): string {
  return [
    `<article class="angle" data-angle-id="${escapeHtml(angle.id)}" data-angle-revision-id="${escapeHtml(angle.revisionId)}">`,
    `<h3>${escapeHtml(angle.title)}</h3>`,
    `<p class="meta">Cohort: ${escapeHtml(angle.cohort.label)} (<code>${escapeHtml(angle.cohort.key)}</code>, v${angle.cohort.definitionVersion})</p>`,
    `<p><strong>Research question:</strong> ${escapeHtml(angle.researchQuestion)}</p>`,
    `<p>${escapeHtml(angle.summary)}</p>`,
    '<div class="metrics"><h4>Metrics</h4>',
    ...angle.metrics.map(renderMetric),
    "</div>",
    `<p><strong>Recommended action:</strong> ${escapeHtml(angle.recommendedAction)}</p>`,
    `<p class="caveat"><strong>Caveat:</strong> ${escapeHtml(angle.caveat)}</p>`,
    '<div class="evidence"><h4>Evidence</h4><ul>',
    ...angle.evidence.map(
      (evidence) =>
        `<li>${escapeHtml(evidence.label)} · ${escapeHtml(evidence.kind)} · Evidence <code>${escapeHtml(evidence.evidenceId)}</code> · Interview <code>${escapeHtml(evidence.interviewId)}</code></li>`,
    ),
    "</ul></div>",
    "</article>",
  ].join("\n");
}

function renderMetric(metric: AngleMetric): string {
  const populationLabel =
    metric.population === "commerce_population"
      ? "commerce population"
      : "interview sample";
  const sourceLabel =
    metric.source === "observed_commerce"
      ? "Observed commerce"
      : "Self-reported interview";
  const fraction =
    metric.unit === "percent"
      ? ` · ${metric.numerator}/${metric.denominator}`
      : "";

  return `<p class="metric" data-source="${metric.source}" data-population="${metric.population}"><span class="source">${sourceLabel}</span> — ${escapeHtml(metric.name)}: ${escapeHtml(formatMetricValue(metric))}${fraction} · ${populationLabel}</p>`;
}

function formatMetricValue(metric: AngleMetric): string {
  if (metric.unit === "percent") return `${formatNumber(metric.value)}%`;
  return `${formatNumber(metric.value)} ${metric.unit}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function validateReportForRendering(input: unknown): ReportRenderModel {
  return parseReportRenderModel(input);
}

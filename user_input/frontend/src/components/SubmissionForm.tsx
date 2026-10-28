"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BusFront,
  Check,
  CircleAlert,
  Lightbulb,
  MapPin,
  Route,
  Send,
  Sparkles,
} from "lucide-react";
import { submitSuggestion } from "@/lib/api";
import { FEATURE_AREA_LABELS, type FeatureArea, type IssueCategory, type SubmissionKind, type SubmissionPayload } from "@/lib/types";

const ISSUE_CHOICES: { value: IssueCategory; title: string; description: string; icon: typeof Route }[] = [
  { value: "missing_route", title: "Missing route", description: "A bus route is not listed", icon: Route },
  { value: "missing_bus", title: "Missing bus", description: "A bus should be on a route", icon: BusFront },
  { value: "missing_stop", title: "Missing stop", description: "A stop is not shown", icon: MapPin },
  { value: "incorrect_information", title: "Wrong information", description: "Something needs correcting", icon: CircleAlert },
  { value: "other", title: "Something else", description: "Another bus data issue", icon: Sparkles },
];

type FormState = {
  title: string;
  details: string;
  email: string;
  route_number: string;
  bus_number: string;
  origin: string;
  destination: string;
  stop_name: string;
  direction: string;
  operator: string;
  context: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  details: "",
  email: "",
  route_number: "",
  bus_number: "",
  origin: "",
  destination: "",
  stop_name: "",
  direction: "",
  operator: "",
  context: "",
};

export function SubmissionForm({ kind }: { kind: SubmissionKind }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [category, setCategory] = useState<IssueCategory>("missing_route");
  const [featureArea, setFeatureArea] = useState<FeatureArea>("journey_planning");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string; message: string } | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const payload: SubmissionPayload = {
      kind,
      title: form.title.trim(),
      details: form.details.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(kind === "feature"
        ? { feature_area: featureArea }
        : {
            category,
            ...(form.route_number.trim() ? { route_number: form.route_number.trim() } : {}),
            ...(form.bus_number.trim() ? { bus_number: form.bus_number.trim() } : {}),
            ...(form.origin.trim() ? { origin: form.origin.trim() } : {}),
            ...(form.destination.trim() ? { destination: form.destination.trim() } : {}),
            ...(form.stop_name.trim() ? { stop_name: form.stop_name.trim() } : {}),
            ...(form.direction.trim() ? { direction: form.direction.trim() } : {}),
            ...(form.operator.trim() ? { operator: form.operator.trim() } : {}),
            ...(form.context.trim() ? { context: form.context.trim() } : {}),
          }),
    };

    try {
      setSuccess(await submitSuggestion(payload));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not send that just now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function sendAnother() {
    setSuccess(null);
    setError("");
    setForm(EMPTY_FORM);
  }

  if (success) {
    return (
      <section className="submission-card success-card" aria-live="polite">
        <span className="success-check"><Check size={26} strokeWidth={2.5} aria-hidden="true" /></span>
        <span className="success-kicker">THANK YOU FOR HELPING</span>
        <h2>Your note is in good hands.</h2>
        <p>{success.message} Our team will review it before making any changes to the guide.</p>
        <span className="submission-reference">Reference <strong>{success.id.slice(0, 10).toUpperCase()}</strong></span>
        <div className="success-actions">
          <button type="button" className="button-secondary" onClick={sendAnother}>Send another</button>
          <Link className="button-primary" href="/">Back to overview <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>
    );
  }

  return (
    <section className="submission-card" aria-label={kind === "feature" ? "Feature suggestion form" : "Bus information report form"}>
      <div className="form-card-heading">
        <span className="form-card-icon">{kind === "feature" ? <Lightbulb size={19} aria-hidden="true" /> : <Route size={19} aria-hidden="true" />}</span>
        <div><span>YOUR SUBMISSION</span><strong>{kind === "feature" ? "Share a feature idea" : "Tell us what needs attention"}</strong></div>
        <span className="required-note">* Required</span>
      </div>

      <form className="suggestion-form" onSubmit={handleSubmit}>
        {kind === "data_report" ? (
          <fieldset className="issue-fieldset">
            <legend>What would you like to report? <span>*</span></legend>
            <div className="issue-choice-grid" role="radiogroup" aria-label="Bus information issue type">
              {ISSUE_CHOICES.map(({ value, title, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={category === value}
                  className={`issue-choice ${category === value ? "selected" : ""}`}
                  onClick={() => setCategory(value)}
                >
                  <span className="issue-choice-icon"><Icon size={17} aria-hidden="true" /></span>
                  <span className="issue-choice-copy"><strong>{title}</strong><small>{description}</small></span>
                  <span className="radio-dot" aria-hidden="true" />
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="field-group">
            <label htmlFor="feature-area">Which part of Pathsathi is this about? <span className="optional-mark">Optional</span></label>
            <select id="feature-area" className="form-control" value={featureArea} onChange={(event) => setFeatureArea(event.target.value as FeatureArea)}>
              {(Object.entries(FEATURE_AREA_LABELS) as [FeatureArea, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        )}

        {kind === "data_report" && <DataFields category={category} form={form} update={update} />}

        <div className="field-group">
          <label htmlFor={`${kind}-title`}>{kind === "feature" ? "Give your idea a short title" : "A short summary"} <span>*</span></label>
          <input
            id={`${kind}-title`}
            className="form-control"
            type="text"
            required
            minLength={5}
            maxLength={120}
            placeholder={kind === "feature" ? "e.g. Show a landmark near each stop" : "e.g. Route 12C stops at Park Circus"}
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor={`${kind}-details`}>{kind === "feature" ? "Tell us more about your idea" : "What do you know about this?"} <span>*</span></label>
          <textarea
            id={`${kind}-details`}
            className="form-control textarea-control"
            required
            minLength={20}
            maxLength={5000}
            rows={5}
            placeholder={kind === "feature"
              ? "What would the feature do? How would it help you or other passengers?"
              : "Share the details that could help us verify this: what you saw, where it happens, and any useful context."}
            value={form.details}
            onChange={(event) => update("details", event.target.value)}
          />
          <span className="field-hint">{form.details.length}/5000 characters</span>
        </div>

        <div className="field-group">
          <label htmlFor={`${kind}-email`}>Email address <span className="optional-mark">Optional</span></label>
          <input
            id={`${kind}-email`}
            className="form-control"
            type="email"
            maxLength={254}
            placeholder="name@example.com"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
          />
          <span className="field-hint">Only share this if you are happy for us to follow up.</span>
        </div>

        {error && <div className="form-error" role="alert"><CircleAlert size={17} aria-hidden="true" /> {error}</div>}
        <div className="submit-row">
          <p><Check size={14} aria-hidden="true" /> Your contact details are optional.</p>
          <button className="button-primary" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : kind === "feature" ? "Send idea" : "Send report"}
            {!submitting && <Send size={16} aria-hidden="true" />}
          </button>
        </div>
      </form>
    </section>
  );
}

function DataFields({
  category,
  form,
  update,
}: {
  category: IssueCategory;
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  const showRoute = category !== "missing_route";
  const routeRequired = category === "missing_bus";

  return (
    <div className="data-fields">
      {(showRoute || category === "missing_route") && (
        <div className="field-group">
          <label htmlFor="route-number">Bus route number <span className={routeRequired ? "" : "optional-mark"}>{routeRequired ? "*" : "Optional"}</span></label>
          <input id="route-number" className="form-control" type="text" maxLength={60} required={routeRequired} placeholder="e.g. 12C, S12, AC9" value={form.route_number} onChange={(event) => update("route_number", event.target.value)} />
        </div>
      )}

      {category === "missing_route" && (
        <div className="field-grid two-col">
          <div className="field-group">
            <label htmlFor="origin">From stop <span>*</span></label>
            <input id="origin" className="form-control" required maxLength={120} placeholder="e.g. Esplanade" value={form.origin} onChange={(event) => update("origin", event.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="destination">To stop <span>*</span></label>
            <input id="destination" className="form-control" required maxLength={120} placeholder="e.g. Garia" value={form.destination} onChange={(event) => update("destination", event.target.value)} />
          </div>
        </div>
      )}

      {category === "missing_bus" && (
        <div className="field-grid two-col">
          <div className="field-group">
            <label htmlFor="bus-number">Bus number / identifier <span>*</span></label>
            <input id="bus-number" className="form-control" required maxLength={60} placeholder="Registration or fleet number" value={form.bus_number} onChange={(event) => update("bus_number", event.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="direction">Direction <span className="optional-mark">Optional</span></label>
            <input id="direction" className="form-control" maxLength={120} placeholder="e.g. toward Garia" value={form.direction} onChange={(event) => update("direction", event.target.value)} />
          </div>
        </div>
      )}

      {category === "missing_stop" && (
        <div className="field-group">
          <label htmlFor="stop-name">Missing stop name <span>*</span></label>
          <input id="stop-name" className="form-control" required maxLength={160} placeholder="Name of stop or nearby landmark" value={form.stop_name} onChange={(event) => update("stop_name", event.target.value)} />
        </div>
      )}

      {category === "incorrect_information" && (
        <div className="field-group">
          <label htmlFor="correction-context">Where is the information wrong? <span className="optional-mark">Optional</span></label>
          <input id="correction-context" className="form-control" maxLength={500} placeholder="e.g. Route direction, stop order, operator, timetable" value={form.context} onChange={(event) => update("context", event.target.value)} />
        </div>
      )}

      {category === "missing_stop" && (
        <div className="field-group">
          <label htmlFor="stop-area">Nearby landmark or area <span className="optional-mark">Optional</span></label>
          <input id="stop-area" className="form-control" maxLength={500} placeholder="Cross street, market, or nearby landmark" value={form.context} onChange={(event) => update("context", event.target.value)} />
        </div>
      )}

      {category === "incorrect_information" && (
        <div className="field-group">
          <label htmlFor="affected-stop">Affected stop or area <span className="optional-mark">Optional</span></label>
          <input id="affected-stop" className="form-control" maxLength={160} placeholder="A stop or landmark related to the correction" value={form.stop_name} onChange={(event) => update("stop_name", event.target.value)} />
        </div>
      )}

      {category === "other" && (
        <div className="field-group">
          <label htmlFor="other-context">Related route or stop <span className="optional-mark">Optional</span></label>
          <input id="other-context" className="form-control" maxLength={500} placeholder="Add a route number, stop name, or location" value={form.context} onChange={(event) => update("context", event.target.value)} />
        </div>
      )}

      {category === "missing_route" && (
        <div className="field-group">
          <label htmlFor="route-operator">Operator or route name <span className="optional-mark">Optional</span></label>
          <input id="route-operator" className="form-control" maxLength={120} placeholder="If you know it" value={form.operator} onChange={(event) => update("operator", event.target.value)} />
        </div>
      )}

      {category === "missing_bus" && (
        <div className="field-group">
          <label htmlFor="bus-operator">Operator <span className="optional-mark">Optional</span></label>
          <input id="bus-operator" className="form-control" maxLength={120} placeholder="If you know it" value={form.operator} onChange={(event) => update("operator", event.target.value)} />
        </div>
      )}
    </div>
  );
}

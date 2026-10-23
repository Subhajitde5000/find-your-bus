export type SubmissionKind = "feature" | "data_report";
export type IssueCategory = "missing_route" | "missing_bus" | "missing_stop" | "incorrect_information" | "other";
export type FeatureArea = "journey_planning" | "route_details" | "accessibility" | "usability" | "other";

export interface SubmissionPayload {
  kind: SubmissionKind;
  category?: IssueCategory;
  feature_area?: FeatureArea;
  title: string;
  details: string;
  route_number?: string;
  bus_number?: string;
  origin?: string;
  destination?: string;
  stop_name?: string;
  direction?: string;
  operator?: string;
  context?: string;
  email?: string;
}

export interface SubmissionRecord extends SubmissionPayload {
  id: string;
  created_at: string;
  status: string;
}

export const ISSUE_LABELS: Record<IssueCategory, string> = {
  missing_route: "Missing bus route",
  missing_bus: "Missing bus on a route",
  missing_stop: "Missing bus stop",
  incorrect_information: "Wrong route information",
  other: "Something else",
};

export const FEATURE_AREA_LABELS: Record<FeatureArea, string> = {
  journey_planning: "Journey planning",
  route_details: "Route details",
  accessibility: "Accessibility",
  usability: "Ease of use",
  other: "Something else",
};

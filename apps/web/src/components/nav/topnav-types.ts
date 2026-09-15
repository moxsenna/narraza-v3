export type TopNavProject = Readonly<{
  id: string;
  title: string;
  meta?: string;
}>;

export type TopNavMoreItem = Readonly<{
  label: string;
  href?: string;
  reason?: string;
}>;

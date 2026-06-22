# Instructions

## `0.100.2` @ 1

- Instruction polisher: `GPT-5.5`
- Executor: `GLM 5.2` (OpenRouter) with VSCode

---

Implement a SolidJS line chart component in this directory.

### Constraints

- Complete the task in a single pass.
- Do **not** call any tools that require user approval.
- Keep changes outside this directory to an absolute minimum.
- Do **not** introduce any new dependencies.
- Do **not** use jQuery, even if it is already available in the project.
- Use inline styles only.

### Data Model

Each input data point has the following shape:

```ts
interface DataPoint {
  episodeId: EpisodeId;
  date: `${number}-${number}-${number}`; // YYYY-MM-DD
}
```

Additional episode metadata must be retrieved from `ctx`.

Some episodes may not yet have associated rating data. An episode may be
missing:

- an overall rating,
- a rating from the current user,
- or both.

### Component Definition

Implement the component with the following signature:

```ts
export const SubjectEpisodeRatingsLineChart: Component<{
  ctx: Context; // from `context.ts`
  subjectId: SubjectId;
  dataPoints: DataPoint[];
}> = (props) => {};
```

### Chart Layout

- The chart must fill the full width of its parent container.
- Choose an appropriate default height.
- The x-axis represents episode air dates.
- The y-axis represents ratings.
- The y-axis range must be fixed from `0.0` to `10.0`.
- Render y-axis tick marks at every `1.0` increment.

### Dark Mode

Dark mode is enabled when the root `<html>` element has:

```html
data-theme="dark"
```

Any other value (`undefined`, `"light"`, etc.) should be treated as light mode.

### Zooming and Navigation

- The x-axis must support zooming in and out.
- The default zoom level must display all episodes.
- Pinch-to-zoom must be supported on touch devices.

### Data Series

Render two independent line series:

1. Overall episode ratings.
2. Current user's episode ratings.

Requirements:

- Missing values must produce gaps in the line.
- Missing values must **not** be interpolated.

### Hover Interaction

When the pointer is over the chart:

- Snap to the nearest episode position.
- Render a vertical cursor line at the selected episode.
- Display a tooltip containing:

  - Episode air date.
  - Overall rating and rating count (if available).
  - Current user's rating (if available).

The tooltip does **not** need to include the episode title.

### Episode Markers

For every episode:

- Render a vertical dotted guide line aligned with the episode's x-axis
  position.
- Render the episode title vertically alongside that guide line.

The hover cursor must snap only to these episode positions.

## `0.100.2` @ 2

This is a follow-up to “`0.100.2` @ 1”.

- Instruction polisher: `GPT-5.5`
- Executor: `XXX`

### Additional Requirements

- Treat `props.dataPoints` as the authoritative episode ordering.
- Adjacency in `props.dataPoints` defines adjacency in the chart.
- Do not derive episode ordering from episode IDs, air dates, or any other
  source.

### Functional Bugs

#### Incorrect Initial Layout

Episode markers, data points, and vertical episode titles are sometimes rendered
at the left edge of the chart (overlapping the y-axis).

Observed behavior:

- This always occurs briefly when the popup is opened for the first time.
- After closing and reopening the popup, this often persists indefinitely.
- For some subjects, it may already persist on the first open.

This must be fixed.

#### Zoom Synchronization

The following elements do not currently respond to zooming:

- Episode data points.
- Episode title labels.
- Tooltip positioning.

All chart elements must remain synchronized with the current zoom level and
viewport.

#### Tooltip Updates

The tooltip is not updated when the hovered episode changes while the tooltip is
already visible.

Current behavior:

1. Hover episode A → tooltip appears.
2. Move directly to episode B → tooltip content and position remains for episode
   A.

The tooltip must update immediately whenever the hovered episode changes.

#### Missing Line Segments

For some subjects, two valid data points are not connected by a line even though
no missing-value gap exists between them.

Investigate and fix the line-generation logic.

### Visual Corrections

#### Episode Title Placement

Episode titles should:

- Be rendered on the right side of their corresponding guide lines.
- Be rendered above the x-axis.
- Have their bottom edge aligned with the top edge of the x-axis.
- Be readable from top to bottom.

#### X-Axis Labels

The x-axis should display date labels rather than episode labels.

Requirements:

- Labels must be based on actual dates.
- Labels must be independent of episode positions.
- Choose an appropriate tick interval and date format.
- Tick density should adapt to the current zoom level.
- Date labels should remain readable across all zoom levels.

### Performance

Performance is currently subpar.

Symptoms:

- Lag is present even with fewer than 50 episodes.
- The page stops responding when the popup is opened for subjects with more than
  1000 episodes. (Chrome shows “Page Unresponsive” and offers to kill the tab.)

Optimize the implementation.

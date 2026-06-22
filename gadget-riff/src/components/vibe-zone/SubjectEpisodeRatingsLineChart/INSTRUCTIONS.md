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

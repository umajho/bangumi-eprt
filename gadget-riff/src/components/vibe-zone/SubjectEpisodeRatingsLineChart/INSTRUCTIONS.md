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
- Executor: `GLM 5.2` (OpenRouter) with VSCode

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

## `0.100.3` @ 1

This is a follow-up to “`0.100.2` @ 2”.

- Instruction polisher: `GPT-5.5`
- Executor: `GLM 5.2` (OpenRouter) with VSCode

### Bugs to Fix

#### Touch Dragging

Horizontal dragging/panning does not work on touch devices.

Fix touch interaction so that users can drag horizontally to navigate the chart.

### Additional Requirements

#### Trackpad Navigation

Support horizontal navigation using touchpad / trackpad gestures, including:

- Apple Magic Trackpad gestures.
- Standard two-finger horizontal scrolling gestures.
- Equivalent gestures on other platforms.

The chart should respond naturally to platform-native scrolling behavior.

#### Episode Title Links

Episode titles should link to the corresponding episode page:

```text
/ep/{episodeId}
```

Interaction requirements:

##### Touch Devices

- The first tap anywhere on the chart selects the nearest episode.
- The first tap on an episode title must also only select that episode.
- If that episode is already selected, a subsequent tap on its title should
  follow the link.
- Tapping a different title should select that episode instead of navigating.

##### Non-Touch Devices

- Clicking an episode title should immediately follow the link.

#### Overall Score Precision

Display overall ratings with four decimal places:

```text
8.1234
```

Do not round to two decimal places.

#### Gradient Axis Styling

Apply a gradual color progression to:

- y-axis tick labels,
- y-axis guide lines.

The progression should remain readable in both light and dark modes.

#### Rating Count Visualization

For points belonging to the overall-rating series:

- Use point area (not radius) to represent the episode's rating count.
- Larger rating counts should produce larger points.
- The scaling function does not need to be linear.

Requirements:

- Clamp the size to a reasonable hardcoded maximum.
- Prevent large points from overlapping nearby points excessively.
- Prevent large points from touching or obscuring adjacent series elements.

Episodes without a rating count should use the minimum point size.

#### Rating Count Legend

Add a legend explaining the meaning of overall-rating point size.

Placement:

- Above the `10.0` y-axis tick.
- On the right side of the chart.

The legend should:

- Show multiple example point sizes.
- Indicate that point area represents rating count.
- Remain visible and readable at all zoom levels.
- Not overlap chart content.

## `0.100.3` @ 2

This is a follow-up to “`0.100.3` @ 1”.

- Instruction polisher: `GPT-5.5`
- Executor: `GLM 5.2` (OpenRouter) with VSCode

### Bugs to Fix

#### Episode Title Labels Missing

The vertical episode title labels are no longer rendered.

Restore the labels and ensure they remain visible across:

- initial render,
- zooming,
- panning,
- theme changes.

#### Legend Positioning

The rating-count legend is currently positioned between the `9.0` and `10.0`
y-axis ticks.

This is incorrect.

Requirements:

- Reserve additional vertical space above the plotting area.
- Keep the `10.0` tick at the top of the plotting area.
- Render the legend above the `10.0` tick.
- Ensure the legend does not overlap:

  - the plot area,
  - axis labels,
  - axis guide lines,
  - episode labels.

#### Legend Spacing

The example points in the rating-count legend are too close together.

Increase spacing so that:

- adjacent example points do not visually touch,
- labels associated with different example points do not touch,
- the legend remains readable at all supported chart widths.

### Additional Requirements

#### Legend Scaling

The largest example point shown in the rating-count legend must represent the
maximum rating count among all episodes in the current subject.

Requirements:

- Compute the maximum using the currently loaded subject data.
- Use the same sizing function as the actual chart points.
- The largest legend point must match the visual size that would be used for an
  episode with that maximum rating count.
- The displayed count value for that legend entry must be the actual maximum
  rating count.

The legend and chart must therefore remain synchronized whenever the underlying
rating-count distribution changes.

## `0.100.3` @ 3

This is a follow-up to “`0.100.3` @ 2”.

- Instruction polisher: `GPT-5.5`
- Executor: `GLM 5.2` (OpenRouter) with VSCode

### Bugs to Fix

#### Trackpad Gesture Direction

The horizontal navigation direction for trackpad gestures is currently reversed.

Requirements:

- Follow the platform's native scrolling direction.
- Ensure Apple Magic Trackpad gestures behave consistently with other
  horizontally scrollable content in macOS.

#### Touch Interaction with Episode Title Links

On Android Chrome, tapping an episode title immediately follows the link.

This is incorrect.

Requirements:

- On touch devices, the first tap must only select the episode.
- The first tap must never navigate, regardless of whether the tap occurs on the
  title, guide line, point, or any other episode-associated element.
- Navigation may occur only when the already-selected episode title is tapped
  again.
- Verify behavior specifically on Android Chrome.

#### Link Hover Feedback

On macOS Chrome, hovering over an episode title does not provide any indication
that it is clickable.

Requirements:

- Episode titles must expose standard link affordances on pointer-based devices.
- The cursor should indicate that the element is clickable.
- Hover styling should make the interactive nature of the title visually
  apparent.
- The styling should remain consistent with both light and dark themes.

### Additional Requirements

#### Maximum Point Size

The current maximum point size for rating-count visualization is too small.

Increase the hardcoded maximum size substantially.

Requirements:

- The maximum point area should be at least 3× larger than the current maximum.
- The legend must be updated automatically to reflect the new scale.
- The largest point should remain visually distinguishable from medium-sized
  points.
- The size cap should still prevent excessive overlap with nearby chart
  elements.

## `0.100.4` @ 1

This is a follow-up to “`0.100.3` @ 3”.

- Instruction polisher: `GPT-5.5`
- Executor: `GLM 5.2` (OpenCode Go) with OpenCode TUI

### Bugs to Fix

#### Mouse Wheel Zooming

Vertical scrolling no longer zooms the chart horizontally.

Restore the previous zoom behavior.

Requirements:

- Scrolling upward should zoom in horizontally.
- Scrolling downward should zoom out horizontally.
- The zoom operation should be centered around the current pointer position
  whenever possible.
- Zooming should remain smooth and responsive.

#### Regression Prevention

While restoring wheel-based zooming, do not break any existing navigation
functionality.

The following interactions must continue to work correctly:

- Mouse-wheel zooming.
- Touch pinch-to-zoom.
- Touch dragging / panning.
- Trackpad horizontal panning gestures.
- Magic Trackpad gestures.
- Tooltip interaction.
- Episode selection behavior.
- Episode title link behavior.

The wheel-zoom fix should be implemented as a targeted regression fix rather
than a rewrite of the interaction system.

### Verification

Before considering the task complete, verify that the following interaction
matrix works correctly:

| Input Method               | Zoom                  | Pan |
| -------------------------- | --------------------- | --- |
| Mouse wheel                | ✓                     | N/A |
| Touch pinch                | ✓                     | N/A |
| Touch drag                 | N/A                   | ✓   |
| Trackpad horizontal scroll | N/A                   | ✓   |
| Magic Trackpad gestures    | ✓ / ✓ (as applicable) | ✓   |

No previously working interaction should regress while fixing this issue.

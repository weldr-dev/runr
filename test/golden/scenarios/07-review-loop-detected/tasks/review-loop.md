# Review Loop Detection Test Task

This task is designed to trigger review_loop_detected stop.

## Requirements

1. Implement a simple change to src/review-loop-test.ts
2. Add a comment or small modification

## Done Checks

- Build passes
- The done checks require testing the actual CLI behavior

## Note

This task will trigger a review loop because the reviewer always returns request_changes
with identical feedback. The supervisor should detect this and stop with review_loop_detected.

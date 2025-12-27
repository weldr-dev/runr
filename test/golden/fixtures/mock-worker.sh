#!/bin/bash
# Mock worker for golden scenario tests.
# Outputs a minimal valid response that indicates "already done".

# The worker expects input on stdin and outputs JSON.
# We just echo a simple success response.

# Read input (discard it)
cat > /dev/null

# Output a valid JSON response that indicates the work is done
# This mimics what a real worker would return when asked to implement something trivial.
echo '{"result": "already_done", "summary": "No changes needed - task complete"}'

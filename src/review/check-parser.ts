/**
 * Review Check Parser - Extracts actionable requests from review feedback.
 *
 * Parses review responses to identify:
 * - Bullet points and numbered lists
 * - "Please fix/add/update" patterns
 * - Done check names marked as incomplete
 */

/**
 * Extracted review request with optional command mapping.
 */
export interface ReviewRequest {
  text: string;
  suggestedCommand?: string;
  category?: 'type_errors' | 'tests' | 'lint' | 'build' | 'coverage' | 'general';
}

/**
 * Result of parsing review feedback.
 */
export interface ParsedReview {
  requests: ReviewRequest[];
  commandsToSatisfy: string[];
  isApproved: boolean;
}

/**
 * Command mapping patterns - keywords to verification commands.
 */
const COMMAND_MAPPINGS: Array<{
  keywords: string[];
  command: string;
  category: ReviewRequest['category'];
}> = [
  {
    keywords: ['type error', 'typescript error', 'ts error', 'typecheck', 'tsc'],
    command: 'npm run typecheck',
    category: 'type_errors'
  },
  {
    keywords: ['test', 'tests', 'unit test', 'testing', 'spec'],
    command: 'npm test',
    category: 'tests'
  },
  {
    keywords: ['lint', 'linting', 'eslint', 'style'],
    command: 'npm run lint',
    category: 'lint'
  },
  {
    keywords: ['build', 'compile', 'bundle'],
    command: 'npm run build',
    category: 'build'
  },
  {
    keywords: ['coverage', 'test coverage', 'code coverage'],
    command: 'npm test -- --coverage',
    category: 'coverage'
  }
];

/**
 * Request extraction patterns.
 */
const REQUEST_PATTERNS = [
  // Numbered lists: "1. Fix the issue"
  /^\s*\d+[.)]\s*(.+)/gm,
  // Bullet points: "- Fix the issue", "* Fix the issue"
  /^\s*[-*•]\s*(.+)/gm,
  // "Please" patterns: "Please fix...", "Please add..."
  /please\s+(fix|add|update|remove|change|include|ensure|verify|check|run)\s+(.+?)(?:\.|$)/gi,
  // "Need to" patterns: "Need to fix...", "Need to add..."
  /(?:need|needs|should|must|have)\s+to\s+(fix|add|update|remove|change|include|run)\s+(.+?)(?:\.|$)/gi,
  // "Fix the X" patterns
  /fix\s+(?:the\s+)?(.+?)\s+(?:error|issue|problem|bug)/gi,
  // "Add X" patterns
  /add\s+(?:the\s+)?(.+?)\s+(?:test|output|evidence|check)/gi,
  // "Missing X" patterns
  /missing\s+(.+?)(?:\.|,|$)/gi
];

/**
 * Extract bullet points and numbered lists from text.
 */
export function extractListItems(text: string): string[] {
  const items: string[] = [];

  // Numbered lists
  const numberedMatches = text.matchAll(/^\s*\d+[.)]\s*(.+)/gm);
  for (const match of numberedMatches) {
    items.push(match[1].trim());
  }

  // Bullet points
  const bulletMatches = text.matchAll(/^\s*[-*•]\s*(.+)/gm);
  for (const match of bulletMatches) {
    items.push(match[1].trim());
  }

  return items;
}

/**
 * Extract "please fix/add" style requests.
 */
export function extractActionRequests(text: string): string[] {
  const requests: string[] = [];

  // "Please" patterns
  const pleaseMatches = text.matchAll(
    /please\s+(fix|add|update|remove|change|include|ensure|verify|check|run)\s+(.+?)(?:\.|,|$)/gi
  );
  for (const match of pleaseMatches) {
    requests.push(`${match[1]} ${match[2]}`.trim());
  }

  // "Need to" patterns
  const needMatches = text.matchAll(
    /(?:need|needs|should|must|have)\s+to\s+(fix|add|update|remove|change|include|run)\s+(.+?)(?:\.|,|$)/gi
  );
  for (const match of needMatches) {
    requests.push(`${match[1]} ${match[2]}`.trim());
  }

  return requests;
}

/**
 * Map a request to a suggested verification command.
 */
export function mapToCommand(request: string): { command?: string; category?: ReviewRequest['category'] } {
  const lower = request.toLowerCase();

  for (const mapping of COMMAND_MAPPINGS) {
    if (mapping.keywords.some(kw => lower.includes(kw))) {
      return { command: mapping.command, category: mapping.category };
    }
  }

  return {};
}

/**
 * Parse review feedback and extract actionable requests.
 */
export function parseReviewFeedback(reviewText: string): ParsedReview {
  const requests: ReviewRequest[] = [];
  const commandsSet = new Set<string>();

  // Check if approved (no further action needed)
  const lowerText = reviewText.toLowerCase();
  const isApproved =
    lowerText.includes('approved') ||
    lowerText.includes('lgtm') ||
    (lowerText.includes('ready') && lowerText.includes('merge'));

  if (isApproved) {
    return { requests: [], commandsToSatisfy: [], isApproved: true };
  }

  // Extract list items
  const listItems = extractListItems(reviewText);
  for (const item of listItems) {
    const { command, category } = mapToCommand(item);
    requests.push({ text: item, suggestedCommand: command, category });
    if (command) commandsSet.add(command);
  }

  // Extract action requests if no list items found
  if (requests.length === 0) {
    const actionRequests = extractActionRequests(reviewText);
    for (const req of actionRequests) {
      const { command, category } = mapToCommand(req);
      requests.push({ text: req, suggestedCommand: command, category });
      if (command) commandsSet.add(command);
    }
  }

  // Look for specific patterns not in lists
  const errorPatterns = [
    { pattern: /(\d+)\s+(?:type\s+)?error/i, category: 'type_errors' as const },
    { pattern: /(\d+)\s+(?:test|spec)s?\s+fail/i, category: 'tests' as const },
    { pattern: /coverage\s+(?:is\s+)?(?:only\s+)?(\d+)%/i, category: 'coverage' as const },
    { pattern: /(\d+)%\s+coverage/i, category: 'coverage' as const },
    { pattern: /lint\s+(?:error|fail)/i, category: 'lint' as const },
    { pattern: /build\s+(?:error|fail)/i, category: 'build' as const }
  ];

  for (const { pattern, category } of errorPatterns) {
    const match = reviewText.match(pattern);
    if (match) {
      const mapping = COMMAND_MAPPINGS.find(m => m.category === category);
      if (mapping && !commandsSet.has(mapping.command)) {
        // Only add if not already in requests
        const hasCategory = requests.some(r => r.category === category);
        if (!hasCategory) {
          requests.push({
            text: match[0],
            suggestedCommand: mapping.command,
            category
          });
          commandsSet.add(mapping.command);
        }
      }
    }
  }

  return {
    requests,
    commandsToSatisfy: Array.from(commandsSet),
    isApproved: false
  };
}

/**
 * Format parsed review for display.
 */
export function formatReviewRequests(parsed: ParsedReview, runId: string): string[] {
  const lines: string[] = [];

  if (parsed.isApproved) {
    lines.push('Review: Approved');
    return lines;
  }

  if (parsed.requests.length > 0) {
    lines.push('Reviewer requested:');
    parsed.requests.slice(0, 3).forEach((req, i) => {
      lines.push(`  ${i + 1}. ${req.text}`);
    });
    if (parsed.requests.length > 3) {
      lines.push(`  ... and ${parsed.requests.length - 3} more`);
    }
  }

  if (parsed.commandsToSatisfy.length > 0) {
    lines.push('');
    lines.push('Commands to satisfy:');
    for (const cmd of parsed.commandsToSatisfy) {
      lines.push(`  ${cmd}`);
    }
  }

  // Build suggested intervention command
  if (parsed.commandsToSatisfy.length > 0) {
    lines.push('');
    lines.push('Suggested intervention:');
    const cmdArgs = parsed.commandsToSatisfy.map(c => `--cmd "${c}"`).join(' ');
    lines.push(`  runr intervene ${runId} --reason review_loop \\`);
    lines.push(`    --note "Fixed review requests" ${cmdArgs}`);
  }

  return lines;
}

/**
 * Extract review feedback from a done_check list.
 */
export function extractUnmetDoneChecks(
  doneChecks: Array<{ name: string; passed: boolean; message?: string }>
): string[] {
  return doneChecks
    .filter(check => !check.passed)
    .map(check => check.message || check.name);
}

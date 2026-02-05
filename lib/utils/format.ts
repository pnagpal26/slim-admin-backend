/**
 * Name formatting utilities for consistent display across the admin backend
 */

// Lowercase particles that should not be capitalized (unless at start)
const PARTICLES = new Set([
  'de', 'del', 'della', 'di', 'da',  // Italian/Spanish
  'van', 'von', 'der', 'den',         // Dutch/German
  'la', 'le', 'les', 'du',            // French
  'el', 'al',                          // Arabic/Spanish
])

// Prefixes that require the next letter to also be capitalized
const SPECIAL_PREFIXES = ['mc', 'mac', "o'"]

/**
 * Converts a string to title case with proper handling of names.
 *
 * - Capitalizes first letter of each word
 * - Handles ALL CAPS input: "JOHN SMITH" → "John Smith"
 * - Handles lowercase input: "john smith" → "John Smith"
 * - Preserves special cases: "McDonald", "O'Brien", "MacArthur"
 * - Handles particles: "de la Cruz", "van der Berg", "von Trapp"
 * - Trims whitespace
 * - Returns empty string if input is null/undefined
 *
 * @param str - The string to convert
 * @returns The title-cased string
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return ''

  const trimmed = str.trim()
  if (!trimmed) return ''

  // Split on whitespace and process each word
  const words = trimmed.split(/\s+/)

  const result = words.map((word, index) => {
    const lower = word.toLowerCase()

    // Handle particles (de, van, von, etc.) - keep lowercase unless first word
    if (index > 0 && PARTICLES.has(lower)) {
      return lower
    }

    // Handle special prefixes (Mc, Mac, O')
    for (const prefix of SPECIAL_PREFIXES) {
      if (lower.startsWith(prefix) && lower.length > prefix.length) {
        const prefixCapitalized = prefix === "o'"
          ? "O'"
          : prefix.charAt(0).toUpperCase() + prefix.slice(1)
        const rest = lower.slice(prefix.length)
        return prefixCapitalized + rest.charAt(0).toUpperCase() + rest.slice(1)
      }
    }

    // Handle hyphenated names (Mary-Jane, Anne-Marie)
    if (word.includes('-')) {
      return word
        .split('-')
        .map((part) => {
          if (!part) return part
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        })
        .join('-')
    }

    // Handle apostrophes not at start (D'Angelo)
    if (word.includes("'") && !lower.startsWith("o'")) {
      const apostropheIndex = word.indexOf("'")
      if (apostropheIndex > 0 && apostropheIndex < word.length - 1) {
        const before = word.slice(0, apostropheIndex + 1)
        const after = word.slice(apostropheIndex + 1)
        return before.charAt(0).toUpperCase() + before.slice(1).toLowerCase() +
               after.charAt(0).toUpperCase() + after.slice(1).toLowerCase()
      }
    }

    // Standard capitalization
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })

  return result.join(' ')
}

/**
 * Strips the "'s Lockboxes" suffix from team names for cleaner display.
 * The main app defaults team name to "{name}'s Lockboxes" during signup.
 *
 * @param teamName - The raw team name from database
 * @returns Object with display name and full name
 */
export function formatTeamName(teamName: string | null | undefined): {
  displayName: string
  fullName: string
  hasSuffix: boolean
} {
  if (!teamName) {
    return { displayName: '', fullName: '', hasSuffix: false }
  }

  const formatted = toTitleCase(teamName)
  const suffix = "'s Lockboxes"
  const suffixLower = suffix.toLowerCase()

  // Check if name ends with "'s Lockboxes" (case-insensitive)
  if (formatted.toLowerCase().endsWith(suffixLower)) {
    const baseName = formatted.slice(0, -suffix.length).trim()
    return {
      displayName: baseName,
      fullName: formatted,
      hasSuffix: true,
    }
  }

  return {
    displayName: formatted,
    fullName: formatted,
    hasSuffix: false,
  }
}

/**
 * Formats a person's name with proper capitalization.
 * Convenience wrapper around toTitleCase for semantic clarity.
 *
 * @param name - The raw name from database
 * @returns The properly capitalized name
 */
export function formatPersonName(name: string | null | undefined): string {
  return toTitleCase(name)
}

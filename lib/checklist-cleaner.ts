/**
 * Utility functions for cleaning and extracting list items.
 * Identifies and strips conversational preambles (e.g. "I have to buy", "need to get", "buy", "then I have buy"),
 * distinguishes between product shopping lists and task-based checklists,
 * and filters out all forms of background context:
 * - Completed / past activities (e.g. "I have already ordered the cake", "I went to the supermarket yesterday")
 * - Purpose / event prepositional clauses (e.g. "For the birthday party, buy...", "For dinner, get...")
 * - State / condition / problem statements (e.g. "My room is very messy", "The fridge is empty")
 * - Event / preparation statements (e.g. "I am preparing dinner for my friends", "This weekend I am cleaning my house")
 * - Prepositional commute / timing clauses (e.g. "On my way to the office", "Before going to work")
 * - Destination travel statements (e.g. "Today I have to go market")
 * while preserving genuine items, brand names, quantities, and actionable tasks.
 */

/**
 * Detects whether a string is a non-item sentence or context clause:
 * - Completed / past activities (e.g. "I have already ordered the cake", "Bought milk last week")
 * - Purpose / event / occasion prepositional phrases (e.g. "For the birthday party", "For dinner")
 * - State / condition / problem / observation statements (e.g. "My room is very messy", "The fridge is empty")
 * - Event / occasion / preparation statements (e.g. "I am preparing dinner for my friends", "We are throwing a party")
 * - Prepositional commute / time / location context clauses (e.g. "On my way to the office", "Before going to work")
 * - Travel / destination statements (e.g. "Today I have to go market", "I'm going to the supermarket")
 * - Meta list / agenda announcements (e.g. "I have several things to do today", "here is my shopping list")
 * - Bare umbrella category words (e.g. "groceries", "items", "supplies")
 */
export function isNonItemSentence(text: string): boolean {
  if (!text) return true;
  const lower = text.trim().toLowerCase();

  // 1. Completed / Past activities / Existing inventory:
  // e.g. "I already have rice and sugar", "I have already ordered the cake", "Already bought milk", "I went to the supermarket yesterday", "We already booked tickets"
  const alreadyPattern = /\b(?:already|previously)\b/i;
  const completedVerbs =
    /\b(?:ordered|bought|purchased|got|booked|called|arranged|prepared|cleaned|finished|completed|sent|paid|made|done|picked\s+up|baked|taken|went|visited|had|was|were|shopped|have|has|own|possess)\b/i;
  if (
    alreadyPattern.test(lower) &&
    (completedVerbs.test(lower) ||
      /\b(?:have|has|had|'ve|'d)\s+already\b/i.test(lower) ||
      /\balready\s+(?:have|has|had|got|own|possess)\b/i.test(lower))
  ) {
    return true;
  }

  const pastMarkers =
    /\b(?:yesterday|last\s+(?:week|month|night|weekend|year)|earlier\s+today)\b/i;
  if (pastMarkers.test(lower) && completedVerbs.test(lower)) {
    return true;
  }

  // 2. Purpose / event / occasion prepositional phrases:
  // e.g. "For the birthday party", "For the party", "For dinner", "For lunch", "For the trip", "For the meeting", "For breakfast"
  const purposeContextPattern =
    /^\s*for\s+(?:the\s+|my\s+|our\s+)?(?:[\w\s]+?\s+)?(?:party|event|dinner|lunch|breakfast|meal|trip|vacation|picnic|celebration|wedding|birthday|meeting|conference|gathering|office|school|home|room)\.?$/i;
  if (purposeContextPattern.test(lower)) {
    return true;
  }

  // 3. State / Condition / Problem / Need observation statements:
  // e.g. "My room is very messy", "My bathroom needs cleaning supplies", "The fridge is empty", "We are out of groceries"
  const conditionStatePattern =
    /^(?:(?:my|the|our)?\s*(?:room|bedroom|house|kitchen|bathroom|garage|office|fridge|refrigerator|pantry|car|closet|wardrobe|place|apartment)\s+(?:needs|requires)\s+(?:cleaning\s+|some\s+|new\s+)?(?:supplies|items|repairs|things|groceries|cleaning)|(?:my|the|our)?\s*(?:room|bedroom|house|kitchen|bathroom|garage|office|fridge|refrigerator|pantry|car|closet|wardrobe|place|apartment)\s+(?:is|are|looks|seems|became|got)\s+(?:very\s+|really\s+|so\s+|extremely\s+|quite\s+|completely\s+|totally\s+)?(?:messy|dirty|empty|cluttered|disorganized|unorganized|dusty|broken|full|unclean)|there\s+(?:is|are)\s+no\s+[\w\s]+|we\s+are\s+(?:out\s+of|running\s+out\s+of)\s+[\w\s]+|we\s+don't\s+have\s+(?:any|enough)\s+[\w\s]+)\.?$/i;
  if (conditionStatePattern.test(lower)) {
    return true;
  }

  // 3b. General chore / cleaning / project / maintenance goal statements:
  // e.g. "I need to clean my house", "I have to clean my room", "We need to clean the apartment", "I want to organize my closet"
  const choreGoalPattern =
    /^(?:(?:today|tomorrow|this\s+(?:weekend|week))?\s*)?(?:i|we)\s+(?:need\s+to|have\s+to|want\s+to|must|gotta|plan\s+to|am\s+going\s+to|'re\s+going\s+to)\s+(?:clean(?:\s+up)?|tidy(?:\s+up)?|organize|renovate|remodel|paint|wash|fix|repair|deep\s+clean)\s+(?:my|the|our)\s+(?:house|home|room|bedroom|bathroom|kitchen|apartment|garage|closet|place|yard|garden|car)\.?$/i;
  if (choreGoalPattern.test(lower)) {
    return true;
  }

  // 4. Event / Occasion / Project / Activity / Travel preparation statements:
  // e.g. "I am preparing dinner for my friends", "We are throwing a party tonight", "This weekend I am cleaning my house", "I am going on vacation next week"
  const eventActivityPattern =
    /^(?:this\s+(?:weekend|week|month)|today|tomorrow|tonight|next\s+(?:week|month|weekend))?\s*(?:i\s+(?:am|will\s+be|was)|we\s+(?:are|will\s+be))\s+(?:going\s+on\s+(?:a\s+)?(?:vacation|trip|holiday|tour|journey)|traveling|travelling|packing\s+for\s+[\w\s]+|preparing|making|cooking|hosting|organizing|decorating|planning|throwing|baking|having|cleaning|painting|renovating|working\s+on)\s+[\w\s]+?\.?$/i;
  if (eventActivityPattern.test(lower)) {
    return true;
  }

  // 5. Prepositional commute / time / location context clauses:
  // e.g. "On my way to the office", "On the way home", "Before going to work", "While going to school"
  const prepContextPattern =
    /^(?:on\s+(?:my|the|our)\s+way\s+(?:to\s+[^,;.:]+|home|back)|before\s+(?:going|heading|leaving)\s+(?:to\s+[^,;.:]+|home|work)|after\s+(?:leaving|arriving|work|office)|while\s+(?:going|heading|driving|walking)\s+(?:to\s+[^,;.:]+|home)|during\s+(?:my|the)\s+(?:lunch\s+break|commute|drive|trip)|when\s+(?:i\s+go\s+out|i'm\s+at\s+the\s+store))\.?$/i;
  if (prepContextPattern.test(lower)) {
    return true;
  }

  // 6. Travel / destination statements:
  // e.g. "today i have to go market", "i have to go to the store", "i'm going to the supermarket"
  const travelContextPattern =
    /^(?:today\s+|tomorrow\s+|tonight\s+|now\s+)?(?:(?:i'?m|i\s+am|we'?re|we\s+are)\s+(?:going|heading|walking|driving)\s+(?:to\s+)?(?:the\s+)?|(?:i|we)\s+(?:have\s+to|need\s+to|want\s+to|will|must|should)?\s*(?:go|head|visit|travel|walk|drive)\s+(?:to\s+)?(?:the\s+)?|(?:going|heading|visiting)\s+(?:to\s+)?(?:the\s+)?)(?:market|supermarket|grocery(?:\s+store)?|store|mall|shop|shops|bazaar|bazaars|walmart|target|costco|pharmacy|office|work|school)\.?$/i;
  if (travelContextPattern.test(lower)) {
    return true;
  }

  // 7. Meta list / agenda announcements:
  // e.g. "I have several things to do today", "here is my shopping list", "things to do"
  const metaAgendaPattern =
    /^(?:i\s+have\s+(?:several|a\s+few|many|some|\d+)?\s*(?:things|tasks|chores|errands|items)\s+to\s+do(?:\s+today|\s+this\s+week)?|here\s+(?:is|are)\s+(?:the\s+)?(?:items|list)|these\s+are\s+the\s+items|things\s+to\s+(?:buy|do|get))\b/i;
  if (metaAgendaPattern.test(lower)) {
    return true;
  }

  // 8. Bare umbrella category word: "groceries", "items", "supplies"
  if (/^(?:groceries|grocery|items?|supplies|things?)$/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Backward compatibility alias for isNonItemSentence.
 */
export function isIntroductoryContext(rawText: string): boolean {
  return isNonItemSentence(rawText);
}

/**
 * Checks if a phrase is an actionable task description (action verb + object/purpose)
 * e.g. "drop my laptop for repair", "collect my documents", "pick up my parcel", "buy coffee", "water the plants"
 */
export function isActionableTask(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();

  const taskPatterns = [
    // "drop my laptop for repair", "drop off the car at garage"
    /^(?:drop\s+(?:off\s+)?|deliver\s+|hand\s+over\s+)(?:my\s+|the\s+)?\w+/i,
    // "collect my documents", "collect the parcel"
    /^(?:collect|fetch|retrieve)\s+(?:my\s+|the\s+)?\w+/i,
    // "pick up my parcel", "pick up tickets"
    /^(?:pick\s+up)\s+(?:my\s+|the\s+)?\w+/i,
    // "buy coffee" (single task errand vs commodity grocery list)
    /^(?:buy|grab)\s+coffee\b/i,
    // Action tasks: water the plants, feed the cat, lock the door, check emails, etc.
    /^(?:check|attend|submit|send|review|prepare|wash|clean|vacuum|mop|fix|repair|call|email|contact|meet|schedule|pay|renew|cancel|book|water|feed|lock|unlock|close|open)\s+(?:my\s+|the\s+)?\w+/i,
  ];

  return taskPatterns.some((pattern) => pattern.test(lower));
}

/**
 * Strips conversational filler prefixes, errand action frames, and category frames
 * from an individual checklist item.
 * Preserves genuine item names, quantities, and actionable tasks.
 */
export function cleanChecklistItem(rawText: string): string {
  if (!rawText) return "";

  let text = rawText
    .replace(/^\s*(?:\d+[\.\)\-:]\s+|[-*•]\s+)/, "") // numbered bullets like "1. ", "1) ", "1- " or bullets like "- ", "* "
    .replace(/[.,;!?]+$/, "") // trailing punctuation
    .trim();

  // If the whole fragment is just an introductory statement, completed action, or context, discard it
  if (isNonItemSentence(text)) {
    return "";
  }

  // 1. Remove sequence / transition adverbs at start:
  text = text.replace(/^(?:and\s+then|then|after\s+that|and\s+also|also|plus|and)\s+/i, "");
  text = text.replace(/^(?:first|firstly|second|secondly|third|finally|lastly|next)\s+/i, "");

  // 2. Remove inclusion markers: "including", "such as", "like"
  text = text.replace(/^(?:including|such\s+as|like|specifically)\s+/i, "");

  // 3. Remove conversational modal subject preambles: "I need to", "I have to", "I must", "we should", etc.
  text = text
    .replace(
      /^(?:(?:i|we|you)\s+(?:have\s+to|need\s+to|want\s+to|got\s+to|gotta|must|should|will)\s+)/i,
      ""
    )
    .trim();

  // Remove container / bag packing frames before checking actionable task:
  // e.g. "Prepare my gym bag with a towel" -> "a towel", "Prepare a first-aid kit with..." -> "bandages"
  text = text.replace(
    /^(?:please\s+)?(?:(?:prepare|pack|fill|load|stock|organize|set\s+up|make|create)\s+)?(?:(?:my|the|a|an)\s+)?(?:[\w\s-]+?\s+)?(?:bag|backpack|gym\s+bag|suitcase|luggage|box|lunchbox|kit|desk|basket|cart|car|set)\s+with\s+/i,
    ""
  );

  // If this item is recognized as an actionable task, preserve its action verb and phrasing!
  // e.g. "drop my laptop for repair", "collect my documents", "buy coffee", "pick up my parcel", "water the plants"
  if (isActionableTask(text)) {
    if (!text || isNonItemSentence(text)) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // 4. Remove errand destination frames that lead to getting an item (e.g. "visit the pharmacy to get medicine" -> "medicine")
  text = text.replace(
    /^(?:(?:visit|go\s+to|head\s+to|stop\s+by|drop\s+by)\s+(?:the\s+)?[\w\s]+?\s+(?:to\s+)?(?:get|buy|pick\s+up|fetch|collect)\s+)/i,
    ""
  );

  // 5. Remove grocery umbrella category frames:
  // e.g. "buy groceries, including milk" -> "milk"
  text = text.replace(/^(?:buy\s+)?groceries,?\s*(?:including\s+|with\s+)?/i, "");

  // 6. Remove conversational subjects and modal verbs:
  const preamblePatterns = [
    // "Today I only need" / "but today I need to buy only" / "today I need" / "I only need"
    /^(?:(?:but\s+|and\s+)?(?:today\s+|tomorrow\s+)?(?:i|we|you)\s+(?:only\s+|just\s+)?(?:have\s+to|need\s+to|need|want\s+to|want|must|should|will|would\s+like\s+to)\s+(?:only\s+|just\s+)?(?:buy|get|purchase|pick\s+up|grab|pack|take|bring|have|order|make|do)?\s*(?:only|just)?)\s+/i,
    // "I have to buy / I need to buy / I want to buy / I must buy"
    /^(?:(?:i|we|you)\s+(?:have\s+to|need\s+to|want\s+to|got\s+to|gotta|must|should|will|would\s+like\s+to)\s+(?:buy|get|purchase|pick\s+up|grab|pack|take|bring|order|make|do)?)\s+/i,
    // Speech-to-text error variant: "I have buy", "we have buy"
    /^(?:(?:i|we)\s+have\s+buy\s+)/i,
    // "I need / we need" (handles both "i need 2 liters" and "i need to buy 2 liters")
    /^(?:(?:today\s+|tomorrow\s+)?(?:i|we)\s+(?:only\s+|just\s+)?need(?:\s+to)?(?:\s+(?:buy|get|purchase|pick\s+up|grab|pack|take|bring))?)\s+/i,
    // "Remember to buy / Don't forget to get / Make sure to buy"
    /^(?:(?:please\s+)?(?:remember\s+to|don'?t\s+forget\s+to|make\s+sure\s+to)\s+(?:buy|get|purchase|pick\s+up|pack|take|bring)?)\s+/i,
    // Direct command verbs for commodity lists: "buy", "get", "purchase", "grab", "pack", "take", "bring", "add", "put"
    /^(?:(?:please\s+)?(?:buy|get|purchase|pick\s+up|grab|pack|bring|order|add|put|take))\s+/i,
    // "list of", "item of", "items for"
    /^(?:(?:a\s+)?(?:list\s+of|checklist\s+of|items?\s+(?:of|for|to\s+buy)))\s+/i,
    // "only" / "just"
    /^(?:only|just)\s+/i,
  ];

  for (const pattern of preamblePatterns) {
    text = text.replace(pattern, "").trim();
  }

  // 7. Remove leading non-quantity articles:
  text = text.replace(/^some\s+/i, "");
  text = text.replace(/^the\s+/i, "");

  const unitMeasurePattern =
    /^(?:a|an)\s+(?:dozen|liter|litre|kilo|kilogram|gram|pound|ounce|gallon|can|box|bottle|bag|loaf|pack|packet|package|cup|glass|bunch|piece|pair|charger)\b/i;
  if (!unitMeasurePattern.test(text)) {
    text = text.replace(/^(?:a|an)\s+/i, "");
  }

  text = text.replace(/[.,;!?]+$/, "").trim();

  // Final sanity check: if the remaining text is empty or non-item context
  if (!text || isNonItemSentence(text)) return "";

  // Capitalize first letter
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Common compound products and phrases that contain "and" or "&"
 * and should NEVER be split into separate items.
 */
export const COMPOUND_ITEMS: RegExp[] = [
  // Food & Groceries
  /\bmacaroni\s+and\s+cheese\b/gi,
  /\bmac\s+and\s+cheese\b/gi,
  /\bpeanut\s+butter\s+and\s+jelly\b/gi,
  /\bpb\s+and\s+j\b/gi,
  /\bbread\s+and\s+butter\b/gi,
  /\bfish\s+and\s+chips\b/gi,
  /\bsalt\s+and\s+pepper\b/gi,
  /\bstrawberries\s+and\s+cream\b/gi,
  /\bberries\s+and\s+cream\b/gi,
  /\bpeaches\s+and\s+cream\b/gi,
  /\bcookies\s+and\s+cream\b/gi,
  /\bbacon\s+and\s+eggs\b/gi,
  /\bham\s+and\s+cheese\b/gi,
  /\brice\s+and\s+beans\b/gi,
  /\bbeans\s+and\s+rice\b/gi,
  /\bchips\s+and\s+dip\b/gi,
  /\bchips\s+and\s+salsa\b/gi,
  /\boil\s+and\s+vinegar\b/gi,
  /\bgin\s+and\s+tonic\b/gi,
  /\brum\s+and\s+coke\b/gi,
  /\bsweet\s+and\s+sour(?:\s+sauce)?\b/gi,
  /\bpork\s+and\s+beans\b/gi,
  /\bspaghetti\s+and\s+meatballs\b/gi,
  /\bbiscuits\s+and\s+gravy\b/gi,
  /\bchicken\s+and\s+waffles\b/gi,
  /\bcheese\s+and\s+crackers\b/gi,
  /\bhummus\s+and\s+pita\b/gi,

  // Household & Supplies
  /\bpen\s+and\s+paper\b/gi,
  /\bpencil\s+and\s+paper\b/gi,
  /\bbrush\s+and\s+dustpan\b/gi,
  /\bdustpan\s+and\s+brush\b/gi,
  /\bmop\s+and\s+bucket\b/gi,
  /\bneedle\s+and\s+thread\b/gi,
  /\blocks?\s+and\s+keys?\b/gi,
  /\bpots\s+and\s+pans\b/gi,
  /\bcups?\s+and\s+saucers?\b/gi,
  /\bnuts\s+and\s+bolts\b/gi,
  /\bbow\s+and\s+arrow\b/gi,
  /\bsoap\s+and\s+water\b/gi,
  /\bsponge\s+and\s+soap\b/gi,

  // Brand names with and / &
  /\bhead\s+(?:and|&)\s+shoulders\b/gi,
  /\bm\s*(?:and|&)\s*ms?\b/gi,
  /\bben\s+(?:and|&)\s+jerry'?s\b/gi,
  /\bjohnson\s+(?:and|&)\s+johnson\b/gi,
  /\barm\s+(?:and|&)\s+hammer\b/gi,
];

/**
 * Mask compound items and brand names containing "and" or "&"
 * so that item-splitting delimiters do not break them.
 */
export function maskCompoundItems(text: string): string {
  let masked = text;
  // Mask explicit known compound phrases
  for (const pattern of COMPOUND_ITEMS) {
    masked = masked.replace(pattern, (match) => {
      return match
        .replace(/\s+and\s+/gi, " __COMPOUND_AND__ ")
        .replace(/\s*&\s*/g, " __AMPERSAND__ ");
    });
  }
  // Also protect generic word & word patterns (e.g. brand names)
  masked = masked.replace(/(\b\w+)\s*&\s*(\w+\b)/g, "$1 __AMPERSAND__ $2");
  return masked;
}

/**
 * Unmask compound items and brand names.
 */
export function unmaskCompoundItems(text: string): string {
  return text
    .replace(/__COMPOUND_AND__/g, "and")
    .replace(/__AMPERSAND__/g, "&");
}

/**
 * Splits raw natural speech/text into separate clean checklist items.
 * Evaluates sentence boundaries first so that completed activities or background sentences
 * are cleanly discarded before intra-sentence items are split.
 * Protects compound items (e.g. "Macaroni and cheese") and preserves quantities.
 */
export function splitChecklistItems(rawText: string): string[] {
  if (!rawText) return [];

  // Protect decimal numbers from sentence splitting (e.g. "1.5 kg" -> "1__DOT__5 kg")
  const textWithDecimals = rawText.replace(/(\d+)\.(\d+)/g, "$1__DOT__$2");

  // Step 1: Split into sentences / major clauses first
  const rawSentences = textWithDecimals
    .split(/(?:[.!?;:\n]+|\s+--\s+)/)
    .map((s) => s.replace(/__DOT__/g, ".").trim())
    .filter(Boolean);

  const results: string[] = [];

  for (let sentence of rawSentences) {
    // If the entire sentence is background context, completed activity, or observation, discard it!
    if (isNonItemSentence(sentence)) {
      continue;
    }

    // Strip leading purpose / occasion context clauses within sentence:
    // e.g. "For the birthday party, buy balloons..." -> "buy balloons..."
    const purposeClausePattern =
      /^\s*for\s+(?:the\s+|my\s+|our\s+)?(?:[\w\s]+?\s+)?(?:party|event|dinner|lunch|breakfast|meal|trip|vacation|picnic|celebration|wedding|birthday|meeting|conference|gathering|office|school|home|room)\s*[,.;:]\s*/i;
    sentence = sentence.replace(purposeClausePattern, "");

    // Strip container / bag / kit packing instructions:
    // e.g. "Prepare my gym bag with a towel..." -> "a towel...", "Prepare a first-aid kit with..." -> "bandages..."
    const containerPackPattern =
      /^(?:please\s+)?(?:(?:prepare|pack|fill|load|stock|organize|set\s+up|make|create)\s+)?(?:(?:my|the|a|an)\s+)?(?:[\w\s-]+?\s+)?(?:bag|backpack|gym\s+bag|suitcase|luggage|box|lunchbox|kit|desk|basket|cart|car|set)\s+with\s+/i;
    sentence = sentence.replace(containerPackPattern, "");

    // Strip leading existing inventory / already-have clauses at beginning of sentence:
    // e.g. "I already have rice and sugar, but today I need..." -> "today I need..."
    const existingInventoryPattern =
      /^[A-Za-z\s']*\b(?:already|previously)\s+(?:have|has|had|got|bought|ordered|purchased|own)\b[^.,;:]*[,.;:]\s*(?:but\s+|however\s+|so\s+|and\s+)?/i;
    sentence = sentence.replace(existingInventoryPattern, "");

    // Strip past activities with comma/contrast conjunctions at the beginning:
    // e.g. "I went to the supermarket yesterday, but today I need to buy..."
    const pastConjunctionPattern =
      /^[A-Za-z\s']+\b(?:yesterday|last\s+(?:week|month|night|weekend))\b[^.,;:]*[,.;:]\s*(?:but\s+|however\s+|and\s+)?/i;
    sentence = sentence.replace(pastConjunctionPattern, "");

    // Strip leading prepositional commute/time/location context clause at start:
    // e.g. "On my way to the office, I need to..." -> "I need to..."
    const prepContextPattern =
      /^\s*(?:on\s+(?:my|the|our)\s+way\s+(?:to\s+[^,;.:]+|home|back)|before\s+(?:going|heading|leaving)\s+(?:to\s+[^,;.:]+|home|work)|after\s+(?:leaving|arriving|work|office)|while\s+(?:going|heading|driving|walking)\s+(?:to\s+[^,;.:]+|home)|during\s+(?:my|the)\s+(?:lunch\s+break|commute|drive|trip)|when\s+(?:i\s+go\s+out|i'm\s+at\s+the\s+store))\s*[,.;:]\s*/i;
    sentence = sentence.replace(prepContextPattern, "");

    // Strip introductory location/context clause at start if followed by transition:
    // e.g. "Today I have to go market, then I have to buy milk..." -> "I have to buy milk..."
    const introClausePattern =
      /^\s*(?:today\s+|tomorrow\s+|tonight\s+|now\s+)?(?:(?:i'?m|i\s+am|we'?re|we\s+are)\s+(?:going|heading|walking|driving)\s+(?:to\s+)?(?:the\s+)?|(?:i|we)\s+(?:have\s+to|need\s+to|want\s+to|will|must|should)?\s*(?:go|head|visit|travel|walk|drive)\s+(?:to\s+)?(?:the\s+)?|(?:going|heading|visiting)\s+(?:to\s+)?(?:the\s+)?)(?:market|supermarket|grocery(?:\s+store)?|store|mall|shop|shops|bazaar|bazaars|walmart|target|costco|pharmacy)[^,;.:]*(?:[,;.:]\s*(?:then\s+|and\s+then\s+|so\s+|and\s+)?|\s+(?:then\s+|and\s+then\s+|so\s+))\s*/i;
    sentence = sentence.replace(introClausePattern, "");

    // Strip colon introductions: "I have several things to do today: "
    sentence = sentence.replace(
      /^[A-Za-z\s,']+(?:things|tasks|chores|errands|to\s+do|checklist|shopping\s+list)\s*(?:today|this\s+week)?\s*:\s*/i,
      ""
    );

    // Strip category intro frames: "first buy groceries, including " or "buy groceries, including "
    sentence = sentence.replace(
      /^(?:(?:first|firstly)\s+)?(?:buy|get|purchase|pick\s+up)?\s*groceries,?\s+(?:including|such\s+as|like)\s+/i,
      ""
    );

    // Clean whole-string list introduction: "Make a grocery list: ..."
    sentence = sentence
      .replace(
        /^(?:make|create|prepare|start)\s+(?:(?:a|an|my|the)\s+)?(?:(?:shopping|grocery|packing|todo|to-do|task|work)\s+)?(?:list|checklist)(?:\s*(?:of|for|with|:))?\s*/i,
        ""
      )
      .replace(
        /^(?:here\s+is\s+(?:a|my|the)\s+(?:list|checklist)(?:\s*(?:of|for|:))?)\s*/i,
        ""
      )
      .trim();

    if (!sentence || isNonItemSentence(sentence)) {
      continue;
    }

    // Step 2: Protect compound items and brand names before intra-sentence splitting
    sentence = maskCompoundItems(sentence);

    // Step 3: Split intra-sentence items on commas, sequence transitions, and "and"
    const itemSplitRegex =
      /(?:,\s*(?:and\s+finally|finally|and\s+then|then|and\s+also|and\s+|including\s+|plus\s+)?|\s+and\s+finally\s+|\s+finally\s+|\s+and\s+then\s+|\s+then\s+|\s+after\s+that\s+|\s+and\s+also\s+|\s+also\s+|\s+including\s+|\s+plus\s+|\s+and\s+)/i;

    const parts = sentence.split(itemSplitRegex);

    for (let part of parts) {
      part = unmaskCompoundItems(part);
      if (!part || isNonItemSentence(part)) {
        continue;
      }
      part = part.replace(containerPackPattern, "");
      const cleaned = cleanChecklistItem(part);
      if (
        cleaned &&
        !isNonItemSentence(cleaned) &&
        !/^(?:and|then|also|item|or|finally|first)$/i.test(cleaned)
      ) {
        results.push(cleaned);
      }
    }
  }

  return results;
}

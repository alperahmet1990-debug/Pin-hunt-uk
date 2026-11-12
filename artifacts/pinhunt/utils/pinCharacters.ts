/**
 * The characters to show for a pin.
 *
 * Curated pins link characters through pin_characters (CataloguePin.characters).
 * Imported catalogues, Pin & Pop included, store them as text on the pin
 * instead: all_characters ("A, B", or "A; B" from older imports) and
 * main_character. Use the links when there are any, else the text.
 */
import type { CataloguePin } from '@workspace/pin-repository';

export function pinCharacterNames(pin: Pick<CataloguePin, 'characters' | 'allCharacters' | 'mainCharacter'>): string[] {
  if (pin.characters?.length) return pin.characters;
  const fromText = (pin.allCharacters ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
  if (fromText.length) return [...new Set(fromText)];
  return pin.mainCharacter?.trim() ? [pin.mainCharacter.trim()] : [];
}

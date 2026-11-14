import { pinCharacterNames } from '../pinCharacters';

describe('pinCharacterNames', () => {
  it('uses linked characters first', () => {
    expect(pinCharacterNames({ characters: ['Mickey'], allCharacters: 'Goofy', mainCharacter: 'Goofy' })).toEqual(['Mickey']);
  });
  it('falls back to all_characters (Pin & Pop), comma or semicolon separated', () => {
    expect(pinCharacterNames({ characters: [], allCharacters: 'Mickey Mouse, Minnie Mouse' })).toEqual(['Mickey Mouse', 'Minnie Mouse']);
    expect(pinCharacterNames({ characters: [], allCharacters: 'Hatbox Ghost; Hitchhiking Ghosts' })).toEqual(['Hatbox Ghost', 'Hitchhiking Ghosts']);
  });
  it('then main_character, then nothing', () => {
    expect(pinCharacterNames({ characters: [], mainCharacter: ' Stitch ' })).toEqual(['Stitch']);
    expect(pinCharacterNames({ characters: [] })).toEqual([]);
  });
});

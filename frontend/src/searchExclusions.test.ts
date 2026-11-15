import assert from 'node:assert/strict';
import test from 'node:test';
import { formatExclusionWords, parseExclusionWords } from './searchExclusions.ts';

test('exclusion items match the HH API separators, phrases and case-insensitive deduplication', () => {
  assert.deepEqual(parseExclusionWords(' стажёр, продажи; "холодные   звонки"\nСТАЖЁР\r\n ;""'), ['стажёр', 'продажи', 'холодные звонки']);
  assert.deepEqual(parseExclusionWords('  , ;\n\r\t"" '), []);
  assert.deepEqual(parseExclusionWords('NAME:admin) OR (DESCRIPTION:all'), ['NAME:admin) OR (DESCRIPTION:all']);
});

test('display separates individual excluded words and whole phrases', () => {
  assert.equal(formatExclusionWords(parseExclusionWords('стажёр;"холодные звонки",СТАЖЁР')), '«стажёр» · «холодные звонки»');
  assert.equal(formatExclusionWords([]), '');
});

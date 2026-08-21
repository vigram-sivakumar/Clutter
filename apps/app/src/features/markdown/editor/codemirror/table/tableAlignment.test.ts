import { describe, expect, it } from 'vitest';

import { parseTableAlignment } from './tableAlignment';

describe('parseTableAlignment', () => {
  it('no colons anywhere: every column is unaligned (null)', () => {
    expect(parseTableAlignment('| --- | --- |')).toEqual([null, null]);
  });

  it('a leading colon only: left alignment', () => {
    expect(parseTableAlignment('| :--- | --- |')).toEqual(['left', null]);
  });

  it('a trailing colon only: right alignment', () => {
    expect(parseTableAlignment('| --- | ---: |')).toEqual([null, 'right']);
  });

  it('colons on both sides: center alignment', () => {
    expect(parseTableAlignment('| :---: | --- |')).toEqual(['center', null]);
  });

  it('mixed left/center/right across three columns', () => {
    expect(parseTableAlignment('| :--- | :---: | ---: |')).toEqual(['left', 'center', 'right']);
  });

  it('works without a leading pipe', () => {
    expect(parseTableAlignment(':--- | ---')).toEqual(['left', null]);
  });

  it('works without a trailing pipe', () => {
    expect(parseTableAlignment('| --- | :---')).toEqual([null, 'left']);
  });

  it('tolerates extra whitespace around cells', () => {
    expect(parseTableAlignment('|  :---  |  ---:  |')).toEqual(['left', 'right']);
  });

  it('a single-column table', () => {
    expect(parseTableAlignment('| :---: |')).toEqual(['center']);
  });
});

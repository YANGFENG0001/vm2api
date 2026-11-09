import { describe, expect, it } from 'vitest'
import { matchesAllowedModel, toggleAllowedModel } from './allowed-models'

const fable5 = 'claude-fable-5'
const fable51 = 'claude-fable-5-1'
const legacyFable51 = 'claude-fable-5.1'
const fable52 = 'claude-fable-5-2'
const legacyFable52 = 'claude-fable-5.2'

describe('slot model allowlist compatibility', () => {
  it('checks the canonical model for a saved dotted id', () => {
    expect(matchesAllowedModel(fable51, legacyFable51)).toBe(true)
    expect(matchesAllowedModel(legacyFable51, fable51)).toBe(true)
    expect(matchesAllowedModel(fable51, ' CLAUDE-FABLE-5.1 ')).toBe(true)
  })

  it('keeps Fable 5 and Fable 5.1 independently selectable', () => {
    for (const version51 of [fable51, legacyFable51]) {
      expect(matchesAllowedModel(fable5, version51)).toBe(false)
      expect(matchesAllowedModel(version51, fable5)).toBe(false)
    }
    expect(matchesAllowedModel(fable51, 'claude-fable-5-10')).toBe(false)
    expect(matchesAllowedModel(fable51, 'claude-fable-5-1-20260919')).toBe(true)
    expect(
      matchesAllowedModel('claude-haiku-4-5-20251001', 'claude-haiku-4-5')
    ).toBe(true)
  })

  it('keeps Fable 5.2 separate from 5 and 5.1 while accepting its dotted id', () => {
    expect(matchesAllowedModel(fable52, legacyFable52)).toBe(true)
    expect(matchesAllowedModel(legacyFable52, fable52)).toBe(true)
    expect(matchesAllowedModel(fable52, 'claude-fable-5-2-20261107')).toBe(true)
    expect(matchesAllowedModel(fable52, fable51)).toBe(false)
    expect(matchesAllowedModel(fable52, fable5)).toBe(false)
    expect(matchesAllowedModel(fable5, fable52)).toBe(false)
  })

  it('unchecks a saved legacy id without removing Fable 5', () => {
    const saved = [legacyFable51, fable5, 'claude-sonnet-5']
    expect(toggleAllowedModel(saved, fable51, false)).toEqual([
      fable5,
      'claude-sonnet-5',
    ])
    expect(saved).toEqual([legacyFable51, fable5, 'claude-sonnet-5'])
  })

  it('saves canonical ids without duplicate legacy entries', () => {
    expect(toggleAllowedModel([legacyFable51, fable51], fable51, true)).toEqual(
      [fable51]
    )
    expect(toggleAllowedModel(['CLAUDE-FABLE-5-1'], fable51, true)).toEqual([
      fable51,
    ])
    expect(toggleAllowedModel([legacyFable51], fable5, true)).toEqual([
      fable51,
      fable5,
    ])
  })

  it('keeps Opus 5 and Opus 5.5 independently selectable', () => {
    expect(matchesAllowedModel('claude-opus-5-5', 'claude-opus-5.5')).toBe(true)
    expect(matchesAllowedModel('claude-opus-5.5', 'claude-opus-5')).toBe(false)
    expect(matchesAllowedModel('claude-opus-5', 'claude-opus-5-5')).toBe(false)
    expect(
      matchesAllowedModel('claude-opus-5-5', 'claude-opus-5-5-20260922')
    ).toBe(true)
    expect(
      toggleAllowedModel(['claude-opus-5.5'], 'claude-opus-5-5', true)
    ).toEqual(['claude-opus-5-5'])
  })
})

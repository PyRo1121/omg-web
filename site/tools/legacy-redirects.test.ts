import { describe, expect, it } from 'vitest';
import ruleset from '../../docs/operations/legacy-public-redirects.json';

describe('legacy public-page redirect scope', () => {
  it('moves only the four known public pages using permanent canonical targets', () => {
    expect(ruleset.phase).toBe('http_request_dynamic_redirect');
    expect(ruleset.rules).toHaveLength(4);
    expect(ruleset.rules.map(rule => rule.action_parameters.from_value.target_url.value)).toEqual([
      'https://getomg.xyz/',
      'https://getomg.xyz/docs/',
      'https://getomg.xyz/privacy/',
      'https://getomg.xyz/terms/',
    ]);
    for (const rule of ruleset.rules) {
      expect(rule.expression).toContain('http.host eq "omg.latham.cloud"');
      expect(rule.expression).toContain('http.request.method in {"GET" "HEAD"}');
      expect(rule.expression).not.toMatch(/starts_with|wildcard|matches|POST|\/api|\/install/u);
      expect(rule.action_parameters.from_value.status_code).toBe(301);
      expect(rule.action_parameters.from_value.preserve_query_string).toBe(true);
    }
    expect(
      ruleset.rules.map(rule => rule.expression.split(' and http.request.uri.path ')[1])
    ).toEqual([
      'eq "/")',
      'in {"/docs" "/docs/"})',
      'in {"/privacy" "/privacy/"})',
      'in {"/terms" "/terms/"})',
    ]);
  });
});

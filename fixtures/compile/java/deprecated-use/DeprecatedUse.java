package com.example.usage;

import com.example.flags.Flags;
import com.launchdarkly.sdk.EvaluationDetail;
import com.launchdarkly.sdk.LDContext;

/**
 * Uses the deprecated members of the doc-comments golden file from outside {@code Flags}. The
 * compile test compiles it apart from the Maven build and expects a {@code [deprecation]} warning
 * for each use, and none inside {@code Flags}.
 */
public final class DeprecatedUse {
  /** Not instantiable. */
  private DeprecatedUse() {}

  /**
   * Uses the deprecated method, its detail variant and its key constant.
   *
   * @param flags the generated wrapper
   * @param user the context to evaluate for
   * @return a summary of every use
   */
  public static String use(Flags flags, LDContext user) {
    boolean cart = flags.legacyCart(user, false);
    EvaluationDetail<Boolean> cartDetail = flags.legacyCartDetail(user, false);
    return Flags.Keys.LEGACY_CART + cart + cartDetail;
  }
}

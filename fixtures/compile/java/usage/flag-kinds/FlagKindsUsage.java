package com.example.usage;

import com.example.flags.Flags;
import com.launchdarkly.sdk.EvaluationDetail;
import com.launchdarkly.sdk.LDContext;
import com.launchdarkly.sdk.LDValue;

/**
 * Calls every generated method of the flag-kinds golden file, one flag per kind, with the types a
 * consumer would write. The compile test adds it only when compiling that golden file.
 */
public final class FlagKindsUsage {
  /** Not instantiable. */
  private FlagKindsUsage() {}

  /**
   * Evaluates every flag.
   *
   * @param flags the generated wrapper
   * @param user the context to evaluate for
   * @return a summary of every value
   */
  public static String evaluate(Flags flags, LDContext user) {
    boolean checkout = flags.checkoutV2(user, false);
    EvaluationDetail<Boolean> checkoutDetail = flags.checkoutV2Detail(user, false);
    String tier = flags.pricingTier(user, "free");
    EvaluationDetail<String> tierDetail = flags.pricingTierDetail(user, "free");
    double rate = flags.sampleRate(user, 0.5);
    EvaluationDetail<Double> rateDetail = flags.sampleRateDetail(user, 0.5);
    int maxItems = flags.maxCartItems(user, 10);
    EvaluationDetail<Integer> maxItemsDetail = flags.maxCartItemsDetail(user, 10);
    LDValue config = flags.checkoutConfig(user, LDValue.ofNull());
    EvaluationDetail<LDValue> configDetail = flags.checkoutConfigDetail(user, LDValue.ofNull());
    LDValue banners = flags.bannerIds(user, LDValue.buildArray().build());
    EvaluationDetail<LDValue> bannersDetail = flags.bannerIdsDetail(user, LDValue.ofNull());
    String[] keys = {
      Flags.Keys.CHECKOUT_V2,
      Flags.Keys.PRICING_TIER,
      Flags.Keys.SAMPLE_RATE,
      Flags.Keys.MAX_CART_ITEMS,
      Flags.Keys.CHECKOUT_CONFIG,
      Flags.Keys.BANNER_IDS,
    };
    return String.join(",", keys)
        + checkout
        + checkoutDetail
        + tier
        + tierDetail
        + rate
        + rateDetail
        + maxItems
        + maxItemsDetail
        + config
        + configDetail
        + banners
        + bannersDetail;
  }
}

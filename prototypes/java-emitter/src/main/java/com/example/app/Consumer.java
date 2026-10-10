// PROTOTYPE consumer: calls every generated method against an offline client.
package com.example.app;

import com.example.flags.Flags;
import com.launchdarkly.sdk.LDContext;
import com.launchdarkly.sdk.LDValue;
import com.launchdarkly.sdk.server.Components;
import com.launchdarkly.sdk.server.LDClient;
import com.launchdarkly.sdk.server.LDConfig;

/** Prototype call sites. */
public final class Consumer {
  /** Not instantiable. */
  private Consumer() {}

  /**
   * Evaluates every generated accessor against an offline client.
   *
   * @param args unused
   * @throws Exception on close
   */
  public static void main(String[] args) throws Exception {
    LDConfig config = new LDConfig.Builder().offline(true).events(Components.noEvents()).build();
    try (LDClient client = new LDClient("sdk-key", config)) {
      LDContext user = LDContext.create("user-1");
      Flags flags = new Flags(client);
      System.out.println(flags.checkoutV2(user, false) + " " + flags.checkoutV2Detail(user, false));
      System.out.println(
          flags.pricingTier(user, "free") + " " + flags.pricingTierDetail(user, "free"));
      System.out.println(flags.discountRate(user, 0.5) + " " + flags.discountRateDetail(user, 0.5));
      System.out.println(flags.maxItems(user, 10) + " " + flags.maxItemsDetail(user, 10));
      System.out.println(
          flags.checkoutConfig(user, LDValue.ofNull())
              + " "
              + flags.checkoutConfigDetail(user, LDValue.ofNull()));
      System.out.println(Flags.Keys.CHECKOUT_V2);
    }
  }
}

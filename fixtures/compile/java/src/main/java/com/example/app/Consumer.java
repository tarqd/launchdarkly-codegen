package com.example.app;

import com.example.flags.Flags;
import com.launchdarkly.sdk.server.Components;
import com.launchdarkly.sdk.server.LDClient;
import com.launchdarkly.sdk.server.LDConfig;

/** Uses the API every generated file has, whatever its flags. */
public final class Consumer {
  /** Not instantiable. */
  private Consumer() {}

  /**
   * Wraps an offline client.
   *
   * @return the wrapped client
   */
  public static Flags wrap() {
    LDConfig config = new LDConfig.Builder().offline(true).events(Components.noEvents()).build();
    return new Flags(new LDClient("sdk-key", config));
  }
}

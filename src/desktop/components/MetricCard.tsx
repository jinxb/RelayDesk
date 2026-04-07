import React from "react";
import { Flex, Heading, Text } from "@radix-ui/themes";

interface MetricCardProps {
  readonly label: string;
  readonly value: string | React.ReactNode;
  readonly caption: string;
  readonly icon?: React.ReactNode;
  readonly accent?: "teal" | "amber" | "slate" | "rose" | "indigo" | "green";
}

export function MetricCard(props: MetricCardProps) {
  return (
    <section className="relaydesk-dashCard relaydesk-metric">
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Text size="2" weight="medium" color="gray">
            {props.label}
          </Text>
          {props.icon && (
            <div style={{ color: `var(--${props.accent ?? "gray"}-9)` }}>
              {props.icon}
            </div>
          )}
        </Flex>
        
        <Flex align="baseline" gap="2">
          {typeof props.value === "string" || typeof props.value === "number" ? (
            <Heading size="7" weight="bold" style={{ letterSpacing: "-0.02em" }}>
              {props.value}
            </Heading>
          ) : (
            props.value
          )}
        </Flex>

        <Text size="1" color="gray" style={{ lineHeight: 1.3 }}>
          {props.caption}
        </Text>
      </Flex>
    </section>
  );
}

import * as echarts from "echarts";
import { useEffect, useRef } from "react";

/** Thin wrapper around Apache ECharts (ADR-0001). Frontend never ships
 * fabricated metrics as if live -- callers must label demo-fixture series. */
export function EChart({ option, height = 260 }: { option: echarts.EChartsOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}

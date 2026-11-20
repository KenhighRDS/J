"""J: TJR-style liquidity-sweep strategy for index futures. Deterministic rules, an event-driven backtester and the
simulated book that also runs automatic paper trading. See docs/tjr/ in the repository."""
from .config import MODELS, RULES_VERSION, Config, Costs, Exits, Risk, Session

__all__ = ["Config", "Costs", "Exits", "Risk", "Session", "MODELS", "RULES_VERSION"]

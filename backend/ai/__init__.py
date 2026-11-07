"""C's AI layer. Claude writes words; Python owns numbers. Claude can propose, never confirm."""
from .companion import ask
from .actions import make_proposal, Proposal, ProposalError
from .checker import verify, extract_pence, extract_percents
from .templates import check_in_message
from .cache import AnswerCache
from .client import claude_llm

__all__ = ["ask", "make_proposal", "Proposal", "ProposalError", "verify", "extract_pence",
           "extract_percents", "check_in_message", "AnswerCache", "claude_llm"]

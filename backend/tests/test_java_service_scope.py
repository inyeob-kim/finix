"""Tests for scoping multi-@CbbSrvcInfo Java classes to one service."""

from app.domain.java_service_scope import list_cbb_service_codes, scope_java_source_to_service
from app.core.exceptions import InvalidInputError
from app.services.service_rules_service import (
    enforce_expected_service_code,
    validate_and_prepare_yaml,
)
import pytest

SAMPLE = r'''
package bankware.cloud.rbs.businessRule.arrangement.service;

@Service("ArrCndRuleSvc")
public class ArrCndRuleSvc {

	@BxmCategory(logicalName="Get List Arrnagement Condition Class Info")
	@CbbSrvcInfo(srvcCd="CM038",srvcNm="Get List Arrnagement Condition Class Info")
	public List<ArrCndClassIO> getListArrCndClass(ArrCndClassCndInfoIn in) throws BizApplicationException {
		List<ArrCndClassIO> out = new ArrayList<ArrCndClassIO>();
		return out;
	}

	/**
	 * CM039 method
	 */
	@BxmCategory(logicalName = "Get List Arrangement Service Type Info")
	@CbbSrvcInfo(srvcCd = "CM039", srvcNm = "Get List Arrangement Service Type Info")
	public List<ArrCndClassIO> getListCndRuleFromCond(ArrCndClassCndInfoIn in) {
		List<ArrCndClassIO> out = new ArrayList<ArrCndClassIO>();
		ArrSrvcTpIO arrSrvcTpIO = new ArrSrvcTpIO();
		arrSrvcTpIO.setInstCd(in.getInstCd());
		List<ArrSrvcTpIO> rstList = _getArrCndRule().getListArrServiceTp(arrSrvcTpIO);
		return out;
	}

	@CbbSrvcInfo(srvcCd="CM042",srvcNm="Get List Arrnagement Condition Rule Info By Service Info")
	public ArrCndRuleInfoList getListArrCndRuleByArrSrvcTp(ArrCndRuleInfoIn in) throws BizApplicationException {
		return new ArrCndRuleInfoList();
	}
}
'''


def test_list_cbb_service_codes_ordered():
    assert list_cbb_service_codes(SAMPLE) == ["CM038", "CM039", "CM042"]


def test_scope_keeps_only_cm039_method():
    scoped = scope_java_source_to_service(SAMPLE, "CM039")
    assert scoped.used_fallback is False
    assert scoped.method_name == "getListCndRuleFromCond"
    assert scoped.other_service_codes == ("CM038", "CM042")
    assert "getListCndRuleFromCond" in scoped.scoped_source
    assert "getListArrCndClass" not in scoped.scoped_source
    assert "getListArrCndRuleByArrSrvcTp" not in scoped.scoped_source
    assert 'srvcCd = "CM039"' in scoped.scoped_source or 'srvcCd="CM039"' in scoped.scoped_source


def test_reject_case_ids_from_sibling_service():
    yaml_text = """
service_code: CM039
service_name: x
source_version: "1"
dto:
  in: { name: In }
  out: { name: Out }
rules:
  - case_id: CM038-E-001
    rule_type: E
    title: placeholder
    description: placeholder
    input: {}
    expect: { outcome: error, error_code: X }
    assertions: []
    tags: [input]
    source_evidence: { method: m, snippet: s }
  - case_id: CM039-N-001
    rule_type: N
    title: placeholder
    description: placeholder
    input: {}
    expect: { outcome: success, validation_target: ok }
    assertions: []
    tags: [business]
    source_evidence: { method: m, snippet: s }
"""
    with pytest.raises(InvalidInputError, match="CM039-E-"):
        validate_and_prepare_yaml(yaml_text, expected_service_code="CM039")

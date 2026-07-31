"""Source grounding: reject invented error codes and evidence snippets."""

import pytest

from app.core.exceptions import InvalidInputError
from app.domain.source_rule_grounding import validate_rules_grounded_in_source
from app.services.service_rules_service import validate_and_prepare_yaml

CM039_SRC = """
public List<ArrCndClassIO> getListCndRuleFromCond(ArrCndClassCndInfoIn in) {
    List<ArrCndClassIO> out = new ArrayList<ArrCndClassIO>();
    ArrSrvcTpIO arrSrvcTpIO = new ArrSrvcTpIO();
    arrSrvcTpIO.setInstCd(in.getInstCd());
    arrSrvcTpIO.setCndCd(in.getCndCd());
    List<ArrSrvcTpIO> rstList = _getArrCndRule().getListArrServiceTp(arrSrvcTpIO);
    if(null != rstList && !rstList.isEmpty()) {
        for(ArrSrvcTpIO rst : rstList) {
            ArrCndClassIO target = new ArrCndClassIO();
            target.setInstCd(rst.getInstCd());
            out.add(target);
        }
    }
    return out;
}
"""


def test_accepts_utility_check_parm_e_without_error_code():
    yaml_text = """
service_code: CM208
service_name: Inquire Children Menu
source_version: draft
dto:
  in: { name: In }
  out: { name: Out }
rules:
  - case_id: CM208-E-001
    rule_type: E
    title: Missing menu id rejects children menu inquiry
    description: The service rejects the request when menu id is absent because the parent
      menu reference is required to locate child menus for the logged-in user.
    input: { menuId: null, userGrpCd: GRP001 }
    expect:
      outcome: error
      error_code: null
    assertions: []
    tags: [input]
    source_evidence:
      method: getListChildrenMenu
      snippet: StringUtils.checkStringParm(in.getMenuId(), "@menuId");
  - case_id: CM208-N-001
    rule_type: N
    title: Children menu inquiry returns empty list when lookup is null
    description: When the child menu lookup returns null, the service returns an empty out
      object so the caller receives a valid empty structure without throwing.
    input: { menuId: MENU_1, userGrpCd: GRP001 }
    expect:
      outcome: success
      validation_target: Empty menu list structure is returned when no children exist.
    assertions: []
    tags: [business]
    source_evidence:
      method: getListChildrenMenu
      snippet: if (menuList == null) { return new MenuMgmtSvcGetUserMenuListOut(); }
"""
    source = """
    public Out getListChildrenMenu(In in) {
        StringUtils.checkStringParm(in.getMenuId(), "@menuId");
        List menuList = _getMenu().getListChildrenMenu(...);
        if (menuList == null) { return new MenuMgmtSvcGetUserMenuListOut(); }
        return _getMenuMgmtSvcGetUserMenuListOut(menuList);
    }
    """
    _, payload = validate_and_prepare_yaml(
        yaml_text,
        expected_service_code="CM208",
        source_text=source,
    )
    assert payload["rules"][0]["expect"].get("error_code") is None
    assert payload["rules"][0]["rule_type"] == "E"


def test_rejects_e_case_that_only_returns_null():
    """Soft early return is not a business rejection — SF008-style false E."""
    payload = {
        "rules": [
            {
                "rule_type": "E",
                "expect": {"error_code": None},
                "source_evidence": {
                    "method": "_setStaffRetireStsIO",
                    "snippet": "if(in.getStaffId() == null){ return null; }",
                },
            }
        ]
    }
    source = """
    private StaffStsCmIO _setStaffRetireStsIO(StaffChngSvcRetireIndvStaff in) {
        if(in.getStaffId() == null){ return null; }
        return new StaffStsCmIO();
    }
    public void retireIndvStaff(StaffChngSvcRetireIndvStaff in) {
        staff.modifyStaffStatusToRetire(staffStsIO);
    }
    """
    with pytest.raises(InvalidInputError, match="거절 증거"):
        validate_rules_grounded_in_source(payload, source)


def test_accepts_n_only_when_service_has_no_throw():
    yaml_text = """
service_code: SF008
service_name: Retire Individual Staff
source_version: draft
dto:
  in: { name: StaffChngSvcRetireIndvStaff }
  out: { name: DummyIO }
rules:
  - case_id: SF008-N-001
    rule_type: N
    title: Successful staff retirement updates status and records retirement date
    description: When a valid staff ID and retirement status code are provided, the
      service retires the staff member by updating their status and recording the date.
    input: { staffId: STF1, staffStsCd: RETIRED }
    expect:
      outcome: success
      validation_target: staff status is updated to retired
    assertions: []
    tags: [business]
    source_evidence:
      method: retireIndvStaff
      snippet: staff.modifyStaffStatusToRetire(staffStsIO);
  - case_id: SF008-N-002
    rule_type: N
    title: Default change reason is applied when not provided in request
    description: When the change reason content is empty the service applies the default
      reason from configuration so retirement records always have a documented reason.
    input: { staffId: STF1, chngRsnCntnt: null }
    expect:
      outcome: success
      validation_target: default change reason content is populated from configuration
    assertions: []
    tags: [business]
    source_evidence:
      method: retireIndvStaff
      snippet: if(StringUtils.isEmpty(in.getChngRsnCntnt())){ in.setChngRsnCntnt(_getChngRsnCntnt().getChngRsnCntnt()); }
"""
    source = """
    public void retireIndvStaff(StaffChngSvcRetireIndvStaff in) {
        if(StringUtils.isEmpty(in.getChngRsnCntnt())){
            in.setChngRsnCntnt(_getChngRsnCntnt().getChngRsnCntnt());
        }
        if(in.getInstCd() == null) in.setInstCd(ServiceContext.getInstCode());
        StaffCm staff = _getStaffMngr().getStaff(in.getInstCd(), in.getStaffId());
        staff.modifyStaffStatusToRetire(staffStsIO);
    }
    private StaffStsCmIO _setStaffRetireStsIO(StaffChngSvcRetireIndvStaff in) {
        if(in.getStaffId() == null){ return null; }
        return new StaffStsCmIO();
    }
    """
    _, payload = validate_and_prepare_yaml(
        yaml_text,
        expected_service_code="SF008",
        source_text=source,
    )
    assert all(r["rule_type"] == "N" for r in payload["rules"])


def test_rejects_invented_error_code_not_in_source():
    payload = {
        "rules": [
            {
                "rule_type": "E",
                "expect": {"error_code": "CM039E001"},
                "source_evidence": {
                    "method": "getListCndRuleFromCond",
                    "snippet": "arrSrvcTpIO.setInstCd(in.getInstCd());",
                },
            }
        ]
    }
    with pytest.raises(InvalidInputError, match="error_code"):
        validate_rules_grounded_in_source(payload, CM039_SRC)


def test_accepts_if_throw_when_source_has_comment_between():
    source = """
    public void execute(In in) {
        if( StringUtils.isEmpty(in.getStockTxStsCd())){
            // status required
            throw new BizApplicationException("STK001", null);
        }
    }
    """
    payload = {
        "rules": [
            {
                "rule_type": "E",
                "expect": {"error_code": "STK001"},
                "source_evidence": {
                    "method": "execute",
                    "snippet": (
                        "if( StringUtils.isEmpty(in.getStockTxStsCd())){ "
                        "throw new BizApplicationException(\"STK001\", null); }"
                    ),
                },
            }
        ]
    }
    validate_rules_grounded_in_source(payload, source)


def test_accepts_if_body_when_layout_differs():
    source = """
    for (Item item : list) {
        if (CCM01.APRVL_CND_ATR_AMT.equalsIgnoreCase(item.getXtnAtrbtNm())) {
            out.setAmtValue(item.getXtnAtrbtCntnt());
        }
    }
    """
    payload = {
        "rules": [
            {
                "rule_type": "N",
                "expect": {"validation_target": "amount mapped"},
                "source_evidence": {
                    "method": "execute",
                    "snippet": (
                        "if (CCM01.APRVL_CND_ATR_AMT.equalsIgnoreCase(item.getXtnAtrbtNm())) "
                        "{ out.setAmt"
                    ),
                },
            }
        ]
    }
    validate_rules_grounded_in_source(payload, source)


def test_still_rejects_fully_invented_snippet():
    payload = {
        "rules": [
            {
                "rule_type": "N",
                "expect": {"validation_target": "ok"},
                "source_evidence": {
                    "method": "getListCndRuleFromCond",
                    "snippet": 'if(null == instCd) { throw new BizApplicationException("CM039E001"); }',
                },
            }
        ]
    }
    with pytest.raises(InvalidInputError, match="snippet"):
        validate_rules_grounded_in_source(payload, CM039_SRC)


def test_accepts_n_only_with_verbatim_snippet():
    yaml_text = """
service_code: CM039
service_name: Get List Arrangement Service Type Info
source_version: draft
dto:
  in: { name: ArrCndClassCndInfoIn }
  out: { name: List }
rules:
  - case_id: CM039-N-001
    rule_type: N
    title: Inquiry returns mapped arrangement service type list
    description: When institution and condition codes are supplied, the service queries
      arrangement service types and returns a mapped list for downstream processing.
    input: { instCd: INST001, cndCd: CND001 }
    expect:
      outcome: success
      validation_target: Mapped arrangement service type rows are returned in a list.
    assertions: []
    tags: [business]
    source_evidence:
      method: getListCndRuleFromCond
      snippet: List<ArrSrvcTpIO> rstList = _getArrCndRule().getListArrServiceTp(arrSrvcTpIO);
  - case_id: CM039-N-002
    rule_type: N
    title: No matches returns empty list rather than null
    description: When the lookup yields no rows, the service returns the initially empty
      list so callers can treat no-data as an empty collection.
    input: { instCd: INST001, cndCd: NONE }
    expect:
      outcome: success
      validation_target: Output is an empty list instance, not null.
    assertions: []
    tags: [business]
    source_evidence:
      method: getListCndRuleFromCond
      snippet: List<ArrCndClassIO> out = new ArrayList<ArrCndClassIO>();
"""
    canonical, payload = validate_and_prepare_yaml(
        yaml_text,
        expected_service_code="CM039",
        source_text=CM039_SRC,
    )
    assert len(payload["rules"]) == 2
    assert all(r["rule_type"] == "N" for r in payload["rules"])
    assert "CM039-N-001" in canonical

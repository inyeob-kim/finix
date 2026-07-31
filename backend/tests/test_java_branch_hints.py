"""Branch hint detection for source YAML AI."""

from app.domain.java_branch_hints import (
    detect_branch_hints,
    format_branch_hints_for_prompt,
)

CM208_SNIP = r'''
@CbbSrvcInfo(srvcCd = "CM208", srvcNm = "Inquire Children Menu")
public MenuMgmtSvcGetUserMenuListOut getListChildrenMenu(MenuMgmtSvcGetUserChildrenMenuIn in) {
    StringUtils.checkStringParm(in.getMenuId(), "@menuId");
    String[] menuArray = in.getMenuId().split("_");
    String upSeqNbr = menuArray[1];
    List<MenuItmOut> menuList = _getMenu().getListChildrenMenu(instCd, userGroupCd, channelDscd, lngCd, upSeqNbr);
    if (menuList == null) {
        return new MenuMgmtSvcGetUserMenuListOut();
    }
    return _getMenuMgmtSvcGetUserMenuListOut(menuList, upSeqNbr, instCd, userGroupCd, channelDscd, lngCd);
}

private MenuMgmtSvcGetUserMenuListOut _getMenuMgmtSvcGetUserMenuListOut(List<MenuItmOut> menuList, String upSeqNbr, String instCd, String userGrpCd, String chnlDscd, String lngCd) {
    LoginTypeEnum LoginTypeEnum = _getLoginType(ServiceContext.getCustId(), ServiceContext.getStaffId(), ServiceContext.getCustRelatedPersonId()) ;
    boolean hasMaster= _getRoleValidator().checkRoleAthrtyAplyRng(ServiceContext.getStaffId(), RoleAthrtyAplyRngEnum.MASTER.getValue());
    String menuCntrlHdngAplyYn = _getInstParmProvider().getInstParm(InstParamEnum.MENU_CONTROL_HIDING_APPLY_YN.getValue());
    switch (LoginTypeEnum) {
    case STAFF:
        if(hasMaster){ menuSub.setScrnUseYn(CCM01.YES); }
        else { menuSub.setScrnUseYn(_validStaffRole(menuItm, roleList)); }
        break;
    }
    if("Y".equals(menuCntrlHdngAplyYn)){
        if(CCM01.YES.equals(menuSub.getScrnUseYn())){ menuOutList.add(menuItm); }
    }
    menuMgmtSvc04OutSub1HashMap.get(menuItm.getUpSeqNbr()).getChildren().add(menuMgmtSvc04OutSub1HashMap.get(menuItm.getSeqNbr()));
    return output;
}

private String _validStaffRole(MenuItmOut menuItm, List<String> roleList) {
    return _checkScreenRelation(roleList, menuItm.getScrnNbr());
}

private Menu _getMenu() { return menu; }
'''


def test_detect_cm208_style_branches():
    hints = detect_branch_hints(CM208_SNIP, "CM208")
    kinds = {h.kind for h in hints}
    assert "PARAM_CHECK" in kinds
    assert "NULL_TO_EMPTY" in kinds
    assert "ACTOR_SWITCH" in kinds
    assert "AUTHZ_BYPASS" in kinds
    assert "INST_FEATURE_FLAG" in kinds
    assert "AUTH_FILTER" in kinds
    assert "TREE_BUILD" not in kinds


def test_format_branch_hints_is_domain_agnostic():
    hints = detect_branch_hints(CM208_SNIP, "CM208")
    block = format_branch_hints_for_prompt(hints)
    assert "DETECTED BRANCHES" in block
    assert "domain-agnostic" in block or "CBS service" in block
    assert "line coverage" in block
    assert "PARAM_CHECK" in block
    assert "AUTHZ_BYPASS" in block
    assert "returns menu list" not in block
